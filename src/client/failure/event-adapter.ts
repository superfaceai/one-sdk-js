import { NetworkErrors } from '../../internal/interpreter/http';
import { FetchResponse } from '../../internal/interpreter/http/interfaces';
import { clone, sleep } from '../../lib';
import { events } from '../../lib/events';
import { Router } from './policies';
import { FailurePolicy } from './policy';
import { FailureResolution } from './resolution';

export type HooksContext = Record<
  //profile/usecase
  string,
  {
    router: Router;
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

export function registerHooks(hookContext: HooksContext): void {
  console.log('registerFetchRetryHooks');
  console.time('STATE')

  events.on('pre-fetch', { priority: 1 }, async (context, args) => {
    console.timeLog('STATE', 'pre-fetch');
    // only listen to fetch events in perform context
    if (
      context.profile === undefined ||
      context.usecase === undefined ||
      context.provider === undefined
    ) {

      return { kind: 'continue' };
    }

    const performContext = hookContext[`${context.profile}/${context.usecase}`];
    // console.log('pre-fetch context', performContext, 't', Date.now());
    // if there is no configured context, ignore the event as well
    if (performContext === undefined) {
      // console.log('pre-fetch return continue');

      return { kind: 'continue' };
    }
    const resolution = performContext.router.beforeExecution({
      time: context.time.getTime(),
      registryCacheAge: 0, // TODO
    });

    // console.log('pre-fetch res', resolution);

    switch (resolution.kind) {
      case 'continue':
        if (resolution.timeout > 0) {
          const newArgs = clone(args);
          newArgs[1].timeout = resolution.timeout;
          // console.log('pre-fetch return', { kind: 'modify', newArgs });

          return { kind: 'modify', newArgs };
        }
        break;

      case 'backoff':
        await sleep(resolution.backoff);
        if (resolution.timeout > 0) {
          const newArgs = clone(args);
          // TODO: Add timeout to fetch params?
          // newArgs[1].timeout = action.timeout;

          // console.log('pre-fetch return', { kind: 'modify', newArgs });

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
    console.timeLog('STATE', 'post-fetch')//: context', context, 'args', _args, 'res', res);

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
      // console.log('perform context undefined');

      return { kind: 'continue' };
    }

    // defer queued action until post-perform
    if (performContext.queuedAction !== undefined) {

      return { kind: 'continue' };
    }

    let result: FetchResponse | undefined, error;
    try {
      result = await res;
      //TODO: result can be defined but still have err value eq. 500 internal server error
    } catch (err: unknown) {
      // console.log('CATCH', err);

      //TODO: Translate err to ExecutionFailure
      error = err;
    }

    if (result !== undefined) {
      //HACK: this all stuff should be part of some policy nested in router
      // TODO: Detect non-network errors here - move to some HTTP policy
      // console.log(' rusult is defined', result);
      const overidenResolution = resolveHttpErrors(
        result,
        performContext.router,
        context.time.getTime()
      );
      if (overidenResolution) {
        // console.log('OVERIDE RESULT IN POST FETCH', overidenResolution);
        switch (overidenResolution.kind) {
          case 'switch-provider': {
            hookContext[`${context.profile}/${context.usecase}`].queuedAction = {
              kind: 'switch-provider',
              provider: overidenResolution.provider
            }

            // console.log('set context', hookContext)
            return { kind: 'continue' };
          }

          case 'continue':
            return { kind: 'continue' };

          case 'retry':
            return { kind: 'retry' };

          case 'abort':
            return {
              kind: 'modify',
              newResult: Promise.reject(overidenResolution.reason),
            };
        }
      }
      //end of hack
      const resolution = performContext.router.afterSuccess({
        time: context.time.getTime(),
        registryCacheAge: 0, // TODO
      });

      if (resolution.kind === 'continue') {
        return { kind: 'continue' };
      }
    }

    if (error !== undefined) {
      // console.log('post-fetch is err', error, typeof error);

      if (typeof error === 'string' && error === NetworkErrors.TIMEOUT_ERROR) {
        // console.log('TIMEOUT');
      }
      const resolution = performContext.router.afterFailure({
        time: context.time.getTime(),
        registryCacheAge: 0, // TODO,
        // TODO: choose based on error
        kind: 'network',
        issue: 'timeout',
      });

      // console.log('ERR RES', resolution)
      switch (resolution.kind) {
        case 'continue':
          return { kind: 'continue' };

        case 'retry':
          return { kind: 'retry' };

        case 'abort':
          // console.log('aborting with', resolution)

          return {
            kind: 'modify',
            newResult: Promise.reject(resolution.reason),
          };
      }
    }

    throw 'unreachable error';
  });

  events.on('pre-perform', { priority: 1 }, async () => {
    console.timeLog('STATE', 'pre-perform');

    // TODO: anything here?
    return { kind: 'continue' };
  });

  events.on('post-perform', { priority: 1 }, async (context, _args, _res) => {
    console.timeLog('STATE', 'post-perform');

    // this shouldn't happen but if it does just continue for now
    if (
      context.profile === undefined ||
      context.usecase === undefined ||
      context.provider === undefined
    ) {
      return { kind: 'continue' };
    }
    const performContext =
      hookContext[`${context.profile}/${context.usecase}`];

    // console.log('post perform', performContext)
    // if there is no configured context, ignore the event
    if (performContext === undefined) {
      // console.log('queuedAction not set')

      return { kind: 'continue' };
    }

    // perform queued action here
    if (performContext.queuedAction !== undefined) {
      // console.log('DO queuedAction!!!!!!!!!!!!!!!!!!!!');
      // TODO
    }

    // TODO: Detect non-network failure

    return { kind: 'continue' };
  });
}

//This only translates HTTP codes to resolution
//FIX: return types?? 
export function resolveHttpErrors(
  response: FetchResponse,
  router: Router,
  time: number
): FailureResolution | undefined {
  //TODO: let map deal with defined statuses?

  //TODO: move somewhere else - HTTP policy for each context. This policy will be part of eg. Circuit breaker and it will be called prior to circuit breaker logic
  if (response.status === 500) {
    //Abort/recache/switch - let the router decide
    return router.afterFailure({
      time: time,
      registryCacheAge: 0, // TODO,
      kind: 'http',
      statusCode: response.status,
    });
  }
  if (response.status === 429) {
    //TODO: handle retry-after header
    return router.afterFailure({
      time: time,
      registryCacheAge: 0, // TODO,
      kind: 'http',
      statusCode: response.status,
    });
  }
  if (
    (response.status >= 400 && response.status < 500) ||
    response.status === 501
  ) {
    //TODO: try to update maps retry for now
    return router.afterFailure({
      time: time,
      registryCacheAge: 0, // TODO,
      kind: 'http',
      statusCode: response.status,
    });
  }
  // we can assume that the request did not make it to the application, so we can safely retry
  if (
    response.status === 502 ||
    response.status === 503 ||
    response.status === 504
  ) {
    //Retry
    return router.afterFailure({
      time: time,
      registryCacheAge: 0, // TODO,
      kind: 'http',
      statusCode: response.status,
    });
  }

  return undefined;
}
