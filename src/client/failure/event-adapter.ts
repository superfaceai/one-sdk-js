import { NetworkErrors } from '../../internal/interpreter/http';
import { FetchResponse } from '../../internal/interpreter/http/interfaces';
import { clone, sleep } from '../../lib';
import { events } from '../../lib/events';
import { FailurePolicy } from './policy';

//TODO: Maybe do something like this or add provider to key in Eda's orifinal type
export type RetryHooksContext = Record<
  //profile/usecase/provider
  string,
  {
    policy: FailurePolicy;
    queuedAction:
    | undefined
    | { kind: 'switch-provider'; provider: string }
    | { kind: 'recache'; newRegistry?: string };
  }
>;

//OG EDA
// type RetryHooksContext = {
//   [x: string]: {
//     policy: FailurePolicy,
//     queuedAction: undefined | { kind: 'switch-provider', provider: string } | { kind: 'recache', newRegistry?: string }
//   }
// }

//TODO: could we merge FailoverHooksContext with RetryHooksContext? (thre would be difference in key structure profile/usecase/privder vs profile/usecase)
export type FailoverHooksContext = Record<
  //profile/usecase
  string,
  {
    //TODO: Scope to FailoverPolicy??
    policy: FailurePolicy;
    queuedAction:
    | undefined
    | { kind: 'switch-provider'; provider: string }
    | { kind: 'recache'; newRegistry?: string };
  }
>;

export function registerFetchRetryHooks(hookContext: RetryHooksContext): void {
  console.log('registerFetchRetryHooks');
  events.on('pre-fetch', { priority: 1 }, async (context, args) => {
    // only listen to fetch events in perform context
    if (
      context.profile === undefined ||
      context.usecase === undefined ||
      context.provider === undefined
    ) {
      console.log('pre-fetch return continue');

      return { kind: 'continue' };
    }

    const performContext =
      hookContext[`${context.profile}/${context.usecase}/${context.provider}`];
    console.log('pre-fetch context', performContext);
    // if there is no configured context, ignore the event as well
    if (performContext === undefined) {
      console.log('pre-fetch return continue');

      return { kind: 'continue' };
    }
    const resolution = performContext.policy.beforeExecution({
      time: context.time.getTime(),
      registryCacheAge: 0, // TODO
    });

    console.log('pre-fetch res', resolution);

    switch (resolution.kind) {
      case 'continue':
        if (resolution.timeout > 0) {
          const newArgs = clone(args);
          newArgs[1].timeout = resolution.timeout;
          console.log('pre-fetch return', { kind: 'modify', newArgs });

          return { kind: 'modify', newArgs };
        }
        break;

      case 'backoff':
        await sleep(resolution.backoff);
        if (resolution.timeout > 0) {
          const newArgs = clone(args);
          // TODO: Add timeout to fetch params?
          // newArgs[1].timeout = action.timeout;

          console.log('pre-fetch return', { kind: 'modify', newArgs });

          return { kind: 'modify', newArgs };
        }
        break;

      case 'abort':
        return {
          kind: 'abort',
          newResult: Promise.reject(resolution.reason),
        };

      case 'recache':
        performContext.queuedAction = resolution;

        return {
          kind: 'abort',
          newResult: Promise.reject(resolution.kind),
        };

      case 'switch-provider':
        performContext.queuedAction = resolution;

        return {
          kind: 'abort',
          newResult: Promise.reject(resolution.kind),
        };
    }

    return { kind: 'continue' };
  });

  events.on('post-fetch', { priority: 1 }, async (context, _args, res) => {
    // only listen to fetch events in perform context
    console.log('post-fetch: context', context, 'args', _args, 'res', res);

    if (
      context.profile === undefined ||
      context.usecase === undefined ||
      context.provider === undefined
    ) {
      return { kind: 'continue' };
    }

    const performContext =
      hookContext[`${context.profile}/${context.usecase}/${context.provider}`];
    // if there is no configured context, ignore the event as well
    if (performContext === undefined) {
      console.log('perform context undefined');

      return { kind: 'continue' };
    }

    // defer queued action until post-perform
    if (performContext.queuedAction !== undefined) {
      console.log('queue undefined');

      return { kind: 'continue' };
    }

    let result: FetchResponse | undefined, error;
    try {
      result = await res;
      //TODO: result can be defined but still have err value eq. 500 internal server error
    } catch (err: unknown) {
      console.log('CATCH');

      //TODO: Translate err to ExecutionFailure
      error = err;
    }

    if (result !== undefined) {
      // TODO: Detect non-network errors here
      console.log(' rusult is defined', result);
      const resolution = performContext.policy.afterSuccess({
        time: context.time.getTime(),
        registryCacheAge: 0, // TODO
      });

      if (resolution.kind === 'continue') {
        return { kind: 'continue' };
      }
    }

    if (error !== undefined) {
      console.log('post-fetch is err', error, typeof error);

      if (typeof error === 'string' && error === NetworkErrors.TIMEOUT_ERROR) {
        console.log('TIMEOUT');
      }
      const resolution = performContext.policy.afterFailure({
        time: context.time.getTime(),
        registryCacheAge: 0, // TODO,
        // TODO: choose based on error
        kind: 'network',
        issue: 'timeout',
      });

      switch (resolution.kind) {
        case 'continue':
          return { kind: 'continue' };

        case 'retry':
          return { kind: 'retry' };

        case 'abort':
          return {
            kind: 'modify',
            newResult: Promise.reject(resolution.reason),
          };
      }
    }

    throw 'unreachable';
  });

  events.on('pre-perform', { priority: 1 }, async () => {
    console.log('pre-perform');

    // TODO: anything here?
    return { kind: 'continue' };
  });

  events.on('post-perform', { priority: 1 }, async (context, _args, _res) => {
    console.log('post-perform', context, 'args', _args, 'res', _res);
    // this shouldn't happen but if it does just continue for now
    if (
      context.profile === undefined ||
      context.usecase === undefined ||
      context.provider === undefined
    ) {
      return { kind: 'continue' };
    }

    const performContext =
      hookContext[`${context.profile}/${context.usecase}/${context.provider}`];
    // if there is no configured context, ignore the event
    if (performContext === undefined) {
      return { kind: 'continue' };
    }

    // perform queued action here
    if (performContext.queuedAction !== undefined) {
      console.log('DO queuedAction');
      // TODO
    }

    // TODO: Detect non-network failure

    return { kind: 'continue' };
  });
}
