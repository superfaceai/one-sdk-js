import { clone, sleep } from '../../lib';
import { Events } from '../../lib/events';
import { CrossFetchError } from '../../lib/fetch';
import { FailurePolicyRouter } from './policies';

export type HooksContext = Record<
  // profile/usecase
  string,
  {
    router: FailurePolicyRouter;
    // action queued from nested hooks for post-perform
    queuedAction:
      | undefined
      // this is used to signal post-perform to not intercept the return value (for example because error was already resolved by retry policy)
      | { kind: 'no-intercept' }
      // tells post-perform to do provider switch and retry
      | { kind: 'switch-provider'; provider: string }
      // tells post-perform to do provider recache and retry
      | { kind: 'recache'; newRegistry?: string };
  }
>;

export function registerHooks(hookContext: HooksContext, events: Events): void {
  events.on('pre-fetch', { priority: 1 }, async (context, args) => {
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

      case 'abort':
        performContext.queuedAction = { kind: 'no-intercept' };

        return {
          kind: 'abort',
          newResult: Promise.reject(new Error(resolution.reason)),
        };

      case 'recache':
        performContext.queuedAction = resolution;

        return {
          kind: 'abort',
          newResult: Promise.reject('recache in progress'),
        };

      case 'switch-provider':
        performContext.queuedAction = resolution;

        return {
          kind: 'abort',
          newResult: Promise.reject('failover in progress'),
        };
    }

    return { kind: 'continue' };
  });

  events.on('post-fetch', { priority: 1 }, async (context, _args, res) => {
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

    let error: CrossFetchError;
    try {
      await res;

      return { kind: 'continue' };
    } catch (err: unknown) {
      error = err as CrossFetchError;
    }

    const resolution = performContext.router.afterFailure({
      time: context.time.getTime(),
      registryCacheAge: 0, // TODO,
      ...error,
    });

    switch (resolution.kind) {
      case 'continue':
        return { kind: 'continue' };

      case 'retry':
        return { kind: 'retry' };

      case 'abort':
        performContext.queuedAction = { kind: 'no-intercept' };

        return {
          kind: 'modify',
          newResult: Promise.reject(new Error(resolution.reason)),
        };

      case 'switch-provider':
        performContext.queuedAction = {
          kind: 'switch-provider',
          provider: resolution.provider,
        };

        return {
          kind: 'modify',
          newResult: Promise.reject('failover in progress'),
        };
    }
  });

  events.on('pre-unhandled-http', { priority: 1 }, async (context, args) => {
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
      statusCode: response.statusCode,
    });

    switch (resolution.kind) {
      case 'continue':
        return { kind: 'continue' };

      case 'retry':
        return {
          kind: 'abort',
          newResult: Promise.resolve('retry'),
        };

      case 'abort':
        performContext.queuedAction = { kind: 'no-intercept' };

        return {
          kind: 'abort',
          newResult: Promise.reject(new Error(resolution.reason)),
        };

      case 'switch-provider':
        performContext.queuedAction = {
          kind: 'switch-provider',
          provider: resolution.provider,
        };

        return {
          kind: 'abort',
          newResult: Promise.reject('failover in progress'),
        };
    }
  });

  events.on('pre-perform', { priority: 1 }, async () => {
    // TODO: anything here?
    return { kind: 'continue' };
  });

  events.on('post-perform', { priority: 1 }, async (context, args, res) => {
    // this shouldn't happen but if it does just continue for now
    if (
      context.profile === undefined ||
      context.usecase === undefined ||
      context.provider === undefined
    ) {
      return { kind: 'continue' };
    }
    const performContext = hookContext[`${context.profile}/${context.usecase}`];

    // if there is no configured context, ignore the event
    if (performContext === undefined) {
      return { kind: 'continue' };
    }

    // perform queued action here
    if (performContext.queuedAction !== undefined) {
      const action = performContext.queuedAction;
      performContext.queuedAction = undefined;

      switch (action.kind) {
        case 'switch-provider': {
          return {
            kind: 'retry',
            newArgs: [args[0], { ...args[1], provider: action.provider }],
          };
        }

        case 'recache':
          throw 'Not Implemented'; // TODO: how to recache?

        case 'no-intercept':
          return { kind: 'continue' };
      }
    }

    let error;
    try {
      await res;
    } catch (err: unknown) {
      error = err;
    }

    if (error === undefined) {
      const resolution = performContext.router.afterSuccess({
        time: context.time.getTime(),
        registryCacheAge: 0, // TODO
      });

      if (resolution.kind === 'continue') {
        return { kind: 'continue' };
      }
    }

    // TODO: Peform-level failure here
    // const resolution = performContext.router.afterFailure({
    //   time: context.time.getTime(),
    //   registryCacheAge: 0, // TODO
    // });

    return { kind: 'continue' };
  });
}
