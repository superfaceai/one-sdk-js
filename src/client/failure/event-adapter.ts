import { events } from '../../lib/events';
import { sleep, clone } from '../../lib';
import { FailurePolicy } from './policy';

type RetryHooksContext = {
  [x: string]: {
    policy: FailurePolicy,
    queuedAction: undefined | { kind: 'switch-provider', provider: string } | { kind: 'recache', newRegistry?: string }
  }
}

function registerFetchRetryHooks(
  hookContext: RetryHooksContext
) {
  events.on(
    'pre-fetch',
    { priority: 1 },
    async (context, args) => {
      // only listen to fetch events in perform context
      if (context.profile === undefined || context.usecase === undefined) {
        return { kind: 'continue' };
      }

      const performContext = hookContext[`${context.profile}/${context.usecase}`];
      // if there is no configured context, ignore the event as well
      if (performContext === undefined) {
        return { kind: 'continue' };
      }

      const resolution = performContext.policy.beforeExecution(
        {
          time: context.time.getTime(),
          registryCacheAge: 0 // TODO
        }
      );

      switch (resolution.kind) {
        case 'continue':
          if (resolution.timeout > 0) {
            const newArgs = clone(args);
            // TODO: Add timeout to fetch params?
            // newArgs[1].timeout = action.timeout;

            return { kind: 'modify', newArgs };
          }
          break;
    
        case 'backoff':
          await sleep(resolution.backoff);
          if (resolution.timeout > 0) {
            const newArgs = clone(args);
            // TODO: Add timeout to fetch params?
            // newArgs[1].timeout = action.timeout;

            return { kind: 'modify', newArgs };
          }
          break;
    
        case 'abort':
          return {
            kind: 'abort',
            newResult: Promise.reject(resolution.reason)
          };
    
        case 'recache':
          performContext.queuedAction = resolution;
          return {
            kind: 'abort',
            newResult: Promise.reject(resolution.kind)
          };
    
        case 'switch-provider':
          performContext.queuedAction = resolution;
          return {
            kind: 'abort',
            newResult: Promise.reject(resolution.kind)
          };
      }

      return { kind: 'continue' };
    }
  ).on(
    'post-fetch',
    { priority: 1 },
    async (context, _args, res) => {
      // only listen to fetch events in perform context
      if (context.profile === undefined || context.usecase === undefined) {
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

      let result, error;
      try {
        result = await res;
      } catch (err) {
        error = err;
      }

      if (result !== undefined) {
        // TODO: Detect non-network errors here

        const resolution = performContext.policy.afterSuccess(
          {
            time: context.time.getTime(),
            registryCacheAge: 0 // TODO
          }
        );

        if (resolution.kind === 'continue') {
          return { kind: 'continue' };
        }
      }

      if (error !== undefined) {
        const resolution = performContext.policy.afterFailure(
          {
            time: context.time.getTime(),
            registryCacheAge: 0, // TODO,
            // TODO: choose based on error
            kind: 'network',
            issue: 'timeout'
          }
        );

        switch (resolution.kind) {
          case 'continue':
            return { kind: 'continue' };
          
          case 'retry':
            return { kind: 'retry' };
          
          case 'abort':
            return { kind: 'modify', newResult: Promise.reject(resolution.reason) };
        }
      }

      throw 'unreachable';
    }
  ).on(
    'pre-perform',
    { priority: 1 },
    async () => {
      // TODO: anything here?
      return { kind: 'continue' };
    }
  ).on(
    'post-perform',
    { priority: 1 },
    async (context, _args, _res) => {
       // this shouldn't happen but if it does just continue for now
       if (context.profile === undefined || context.usecase === undefined) {
        return { kind: 'continue' };
      }

      const performContext = hookContext[`${context.profile}/${context.usecase}`];
      // if there is no configured context, ignore the event
      if (performContext === undefined) {
        return { kind: 'continue' };
      }

      // perform queued action here
      if (performContext.queuedAction !== undefined) {
        // TODO
      }

      // TODO: Detect non-network failure

      return { kind: 'continue' };
    }
  );
}
