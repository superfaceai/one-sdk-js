import createDebug from 'debug';

import { SDKBindError, UnexpectedError } from '../../internal/errors';
import { clone, sleep } from '../../lib';
import { Events } from '../../lib/events';
import { isCrossFetchError } from '../../lib/fetch.errors';
import { FailurePolicyRouter } from './policies';
import { ExecutionFailure, FailurePolicyReason } from './policy';
import {
  AbortResolution,
  RecacheResolution,
  SwitchProviderResolution,
} from './resolution';

const debug = createDebug('superface:failover');
const debugSensitive = createDebug('superface:failover:sensitive');
debugSensitive(
  `
WARNING: YOU HAVE ALLOWED LOGGING SENSITIVE INFORMATION.
THIS LOGGING LEVEL DOES NOT PREVENT LEAKING SECRETS AND SHOULD NOT BE USED IF THE LOGS ARE GOING TO BE SHARED.
CONSIDER DISABLING SENSITIVE INFORMATION LOGGING BY APPENDING THE DEBUG ENVIRONMENT VARIABLE WITH ",-*:sensitive".
`
);

export type QueuedAction =
  | undefined
  // full abort, retry policy has been notified and now we are propagating the error
  | { kind: 'full-abort'; reason: FailurePolicyReason }
  // tells post-perform to do provider switch and retry
  | { kind: 'switch-provider'; provider: string; reason: FailurePolicyReason }
  // tells post-perform to do provider recache and retry
  | { kind: 'recache'; newRegistry?: string; reason: FailurePolicyReason };

export type HooksContext = Record<
  // profile/usecase
  string,
  {
    router: FailurePolicyRouter;
    // action queued from nested hooks for the last hook
    queuedAction: QueuedAction;
  }
>;

function handleCommonResolution(
  performContext: HooksContext[string],
  resolution: AbortResolution | RecacheResolution | SwitchProviderResolution
): { newResult: Promise<never> } {
  switch (resolution.kind) {
    case 'abort':
      performContext.queuedAction = {
        kind: 'full-abort',
        reason: resolution.reason,
      };

      return {
        // this error will be overridden in post-bind-and-perform
        newResult: Promise.reject('full abort in progress'),
      };

    case 'recache':
      performContext.queuedAction = resolution;

      return {
        // this error will be overridden in post-bind-and-perform
        newResult: Promise.reject('recache in progress'),
      };

    case 'switch-provider':
      performContext.queuedAction = resolution;

      return {
        // this error will be overridden in post-bind-and-perform
        newResult: Promise.reject('failover in progress'),
      };
  }
}

export function registerHooks(hookContext: HooksContext, events: Events): void {
  registerNetworkHooks(hookContext, events);

  events.on('pre-bind-and-perform', { priority: 1 }, async (context, args) => {
    debug('Handling event pre-bind-and-perform with context:', context);
    debugSensitive('\targs:', args);

    // only check failover restore when the provider is not manually set
    if (args[1]?.provider !== undefined) {
      return { kind: 'continue' };
    }

    const performContext = hookContext[`${context.profile}/${context.usecase}`];
    // if there is no configured context: ignore the event
    if (performContext === undefined) {
      return { kind: 'continue' };
    }

    if (performContext.router.getCurrentProvider() === undefined) {
      return { kind: 'continue' };
    }

    const resolution = performContext.router.beforeExecution({
      time: context.time.getTime(),
      registryCacheAge: 0, // TODO
      checkFailoverRestore: true,
    });

    switch (resolution.kind) {
      case 'continue':
        return { kind: 'continue' };

      case 'backoff':
        return { kind: 'continue' };

      default:
        return {
          kind: 'abort',
          ...handleCommonResolution(performContext, resolution),
        };
    }
  });

  events.on(
    'post-bind-and-perform',
    { priority: 1 },
    async (context, args, res) => {
      debug('Handling event post-bind-and-perform with context:', context);
      debugSensitive('\targs:', args);
      debugSensitive('\tresult:', res);

      if (context.provider === undefined) {
        throw new UnexpectedError('Invalid event context');
      }

      const performContext =
        hookContext[`${context.profile}/${context.usecase}`];

      // if there is no configured context: ignore the event
      if (performContext === undefined) {
        return { kind: 'continue' };
      }

      const queuedAction = performContext.queuedAction;
      // if there is no queued action, check result, possibly emitting a new queued action
      if (queuedAction === undefined) {
        let error;
        try {
          const result = await res;
          if (result.isErr()) {
            error = result.error;
          }
        } catch (err: unknown) {
          error = err;
        }

        // this is a success!
        if (error === undefined) {
          void events.emit('success', [
            {
              time: new Date(),
              usecase: context.usecase,
              profile: context.profile,
              provider: context.provider,
            },
          ]);

          const resolution = performContext.router.afterSuccess({
            time: context.time.getTime(),
            registryCacheAge: 0, // TODO
          });

          if (resolution.kind === 'continue') {
            return { kind: 'continue' };
          }
        }

        // error is defined, handle it
        void events.emit('failure', [
          {
            time: new Date(),
            usecase: context.usecase,
            profile: context.profile,
            provider: context.provider,
          },
        ]);

        //Handle bind-level failure here
        if (error instanceof SDKBindError) {
          const resolution = performContext.router.afterFailure({
            kind: 'bind',
            originalError: error,
            time: context.time.getTime(),
            registryCacheAge: 0, // TODO
          });
          //Try to switch providers
          if (resolution.kind === 'switch-provider') {
            performContext.queuedAction = resolution;
          }
        }

        // TODO: Perform-level failure here (when another failure is defined in ExecutionFailure)
        // This might emit another queued action, which he'd handle below
        // const resolution = performContext.router.afterFailure({
        //   time: context.time.getTime(),
        //   registryCacheAge: 0, // TODO
        // });
      }

      // perform queued action here
      if (performContext.queuedAction !== undefined) {
        const action = performContext.queuedAction;
        performContext.queuedAction = undefined;

        // ignore the placeholder error we produced in `handleCommonResolution`
        await res.catch(_err => undefined);

        switch (action.kind) {
          case 'switch-provider': {
            debug('Switching to provider', action.provider);
            void events.emit('provider-switch', [
              {
                time: new Date(),
                toProvider: action.provider,
                provider: context.provider,
                usecase: context.usecase,
                profile: context.profile,
                reason: action.reason,
              },
            ]);

            return {
              kind: 'retry',
              newArgs: [args[0], { ...args[1], provider: action.provider }],
            };
          }

          case 'recache':
            throw new UnexpectedError('Not Implemented'); // TODO: how to recache?

          case 'full-abort':
            // missing `toProvider` means that provider-switch **could not** happen
            void events.emit('provider-switch', [
              {
                time: new Date(),
                provider: context.provider,
                usecase: context.usecase,
                profile: context.profile,
                reason: action.reason,
              },
            ]);

            return {
              kind: 'modify',
              newResult: Promise.reject(action.reason.toError()),
            };
        }
      }

      return { kind: 'continue' };
    }
  );
}

function registerNetworkHooks(hookContext: HooksContext, events: Events): void {
  events.on('pre-fetch', { priority: 1 }, async (context, args) => {
    debug('Handling event pre-fetch with context:', context);
    debugSensitive('\targs:', args);
    // only listen to fetch events in perform context
    if (
      context.profile === undefined ||
      context.usecase === undefined ||
      context.provider === undefined
    ) {
      return { kind: 'continue' };
    }

    const performContext = hookContext[`${context.profile}/${context.usecase}`];
    // if there is no configured context, ignore the event as well
    if (performContext === undefined) {
      return { kind: 'continue' };
    }
    const resolution = performContext.router.beforeExecution({
      time: context.time.getTime(),
      registryCacheAge: 0, // TODO
      checkFailoverRestore: false,
    });

    switch (resolution.kind) {
      case 'continue':
        if (resolution.timeout > 0) {
          const newArgs = clone(args);
          newArgs[1].timeout = resolution.timeout;

          return { kind: 'modify', newArgs };
        }
        break;

      case 'backoff':
        await sleep(resolution.backoff);
        if (resolution.timeout > 0) {
          const newArgs = clone(args);
          newArgs[1].timeout = resolution.timeout;

          return { kind: 'modify', newArgs };
        }
        break;

      default:
        return {
          kind: 'abort',
          ...handleCommonResolution(performContext, resolution),
        };
    }

    return { kind: 'continue' };
  });

  events.on('post-fetch', { priority: 1 }, async (context, args, res) => {
    debug('Handling event post-fetch with context:', context);
    debugSensitive('\targs:', args);
    debugSensitive('\tresult:', res);
    // only listen to fetch events in perform context
    if (
      context.profile === undefined ||
      context.usecase === undefined ||
      context.provider === undefined
    ) {
      return { kind: 'continue' };
    }

    const performContext = hookContext[`${context.profile}/${context.usecase}`];
    // if there is no configured context, ignore the event as well
    if (performContext === undefined) {
      return { kind: 'continue' };
    }

    // defer queued action until post-perform
    if (performContext.queuedAction !== undefined) {
      return { kind: 'continue' };
    }

    let error: Error;
    try {
      await res;

      return { kind: 'continue' };
    } catch (err: unknown) {
      error = err as Error;
    }

    void events.emit('failure', [
      {
        time: new Date(),
        usecase: context.usecase,
        profile: context.profile,
        provider: context.provider,
      },
    ]);

    let failure: ExecutionFailure;

    if (isCrossFetchError(error)) {
      failure = {
        time: context.time.getTime(),
        registryCacheAge: 0, // TODO,
        ...error.normalized,
      };
    } else {
      failure = {
        kind: 'unknown',
        time: context.time.getTime(),
        registryCacheAge: 0,
        originalError: error,
      };
    }

    const resolution = performContext.router.afterFailure(failure);

    switch (resolution.kind) {
      case 'continue':
        return { kind: 'continue' };

      case 'retry':
        return { kind: 'retry' };

      default:
        return {
          kind: 'modify',
          ...handleCommonResolution(performContext, resolution),
        };
    }
  });

  events.on('pre-unhandled-http', { priority: 1 }, async (context, args) => {
    debug('Handling event pre-unhandled-http with context:', context);
    debugSensitive('\targs:', args);
    // common handling
    if (
      context.profile === undefined ||
      context.usecase === undefined ||
      context.provider === undefined
    ) {
      return { kind: 'continue' };
    }
    const performContext = hookContext[`${context.profile}/${context.usecase}`];
    if (performContext === undefined) {
      return { kind: 'continue' };
    }
    if (performContext.queuedAction !== undefined) {
      return { kind: 'continue' };
    }

    // dispatch to policy if http error
    const response = args[2];
    if (response.statusCode < 400) {
      return { kind: 'continue' };
    }

    const resolution = performContext.router.afterFailure({
      time: context.time.getTime(),
      registryCacheAge: 0, // TODO,
      kind: 'http',
      response,
    });

    switch (resolution.kind) {
      case 'continue':
        return { kind: 'continue' };

      case 'retry':
        return {
          kind: 'abort',
          newResult: Promise.resolve('retry'),
        };

      default:
        return {
          kind: 'abort',
          ...handleCommonResolution(performContext, resolution),
        };
    }
  });
}
