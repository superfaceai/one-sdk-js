import {
  AbortPolicy,
  CircuitBreakerPolicy,
  FailurePolicyRouter,
  RetryPolicy,
} from './policies';
import { UsecaseInfo } from './policy';

describe('failure policies', () => {
  const usecaseInfo: UsecaseInfo = {
    profileId: 'profile',
    usecaseName: 'usecase',
    usecaseSafety: 'safe',
  };

  describe('abort policy', () => {
    const policy = new AbortPolicy(usecaseInfo);

    const failure = {
      kind: 'request',
      issue: 'abort',
      registryCacheAge: 0,
      time: 0,
    } as const;

    it('always aborts on failure', () => {
      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'abort',
        reason: 'abort policy selected',
      });
      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'abort',
        reason: 'abort policy selected',
      });
      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'abort',
        reason: 'abort policy selected',
      });
    });

    it('always continues on success', () => {
      const event = { time: 0, registryCacheAge: 0 };

      expect(policy.afterSuccess(event)).toStrictEqual({ kind: 'continue' });
      expect(policy.afterSuccess(event)).toStrictEqual({ kind: 'continue' });
      expect(policy.afterSuccess(event)).toStrictEqual({ kind: 'continue' });
    });
  });

  describe('backoff policy', () => {
    const failure = {
      kind: 'request',
      issue: 'abort',
      registryCacheAge: 0,
      time: 0,
    } as const;

    it('aborts after configured number of retries', () => {
      const policy = new RetryPolicy(usecaseInfo, 3);
      const event = { time: 0, registryCacheAge: 0 };

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'retry',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        backoff: 100,
        timeout: 30_000,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'retry',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        backoff: 200,
        timeout: 30_000,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'retry',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        backoff: 400,
        timeout: 30_000,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'abort',
        reason: 'max retries exceeded',
      });
    });

    it('continues without failures', () => {
      const policy = new RetryPolicy(usecaseInfo, 3);
      const event = { time: 0, registryCacheAge: 0 };

      expect(policy.afterSuccess(event)).toStrictEqual({ kind: 'continue' });
      expect(policy.afterSuccess(event)).toStrictEqual({ kind: 'continue' });
      expect(policy.afterSuccess(event)).toStrictEqual({ kind: 'continue' });
    });

    it('backs down after failures', () => {
      const policy = new RetryPolicy(usecaseInfo, 3);
      const event = { time: 0, registryCacheAge: 0 };

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'retry',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        backoff: 100,
        timeout: 30_000,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'retry',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        backoff: 200,
        timeout: 30_000,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'retry',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        backoff: 400,
        timeout: 30_000,
      });

      expect(policy.afterSuccess(event)).toStrictEqual({ kind: 'continue' });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        backoff: 200,
        timeout: 30_000,
      });

      expect(policy.afterSuccess(event)).toStrictEqual({ kind: 'continue' });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        backoff: 100,
        timeout: 30_000,
      });

      expect(policy.afterSuccess(event)).toStrictEqual({ kind: 'continue' });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'continue',
        timeout: 30_000,
      });
    });

    it('backsoff after successes', () => {
      const policy = new RetryPolicy(usecaseInfo, 3);
      const event = { time: 0, registryCacheAge: 0 };

      expect(policy.afterSuccess(event)).toStrictEqual({ kind: 'continue' });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'continue',
        timeout: 30_000,
      });

      expect(policy.afterSuccess(event)).toStrictEqual({ kind: 'continue' });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'continue',
        timeout: 30_000,
      });

      expect(policy.afterSuccess(event)).toStrictEqual({ kind: 'continue' });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'continue',
        timeout: 30_000,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'retry',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        backoff: 100,
        timeout: 30_000,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'retry',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        backoff: 200,
        timeout: 30_000,
      });

      expect(policy.afterSuccess(event)).toStrictEqual({ kind: 'continue' });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        backoff: 100,
        timeout: 30_000,
      });

      expect(policy.afterSuccess(event)).toStrictEqual({ kind: 'continue' });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'continue',
        timeout: 30_000,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'retry',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        backoff: 100,
        timeout: 30_000,
      });

      expect(policy.afterSuccess(event)).toStrictEqual({ kind: 'continue' });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'continue',
        timeout: 30_000,
      });
    });

    it('resets correctly', () => {
      const policy = new RetryPolicy(usecaseInfo, 3);
      const event = { time: 0, registryCacheAge: 0 };

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'retry',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        backoff: 100,
        timeout: 30_000,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'retry',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        backoff: 200,
        timeout: 30_000,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'retry',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        backoff: 400,
        timeout: 30_000,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'abort',
        reason: 'max retries exceeded',
      });

      policy.reset();
      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'retry',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        backoff: 100,
        timeout: 30_000,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'retry',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        backoff: 200,
        timeout: 30_000,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'retry',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        backoff: 400,
        timeout: 30_000,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'abort',
        reason: 'max retries exceeded',
      });

      policy.reset();
      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'retry',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        backoff: 100,
        timeout: 30_000,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'retry',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        backoff: 200,
        timeout: 30_000,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'retry',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        backoff: 400,
        timeout: 30_000,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'abort',
        reason: 'max retries exceeded',
      });
    });
  });

  describe('circuit breaker policy', () => {
    const failure = {
      kind: 'request',
      issue: 'abort',
      registryCacheAge: 0,
      time: 0,
    } as const;

    it('starts closed', () => {
      const policy = new CircuitBreakerPolicy(usecaseInfo, 4, 1000, 30_000);
      const event = { time: 0, registryCacheAge: 0 };

      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'continue',
        timeout: 30_000,
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'continue',
        timeout: 30_000,
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'continue',
        timeout: 30_000,
      });
    });

    it('stays closed when not enough contiguous failures happen', () => {
      const policy = new CircuitBreakerPolicy(usecaseInfo, 4, 1000, 30_000);
      const event = { time: 0, registryCacheAge: 0 };

      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'continue',
        timeout: 30_000,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'retry',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 30_000,
        backoff: 100,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'retry',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 30_000,
        backoff: 200,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'retry',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 30_000,
        backoff: 400,
      });

      expect(policy.afterSuccess(event)).toStrictEqual({ kind: 'continue' });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 30_000,
        backoff: 200,
      });

      expect(policy.afterSuccess(event)).toStrictEqual({ kind: 'continue' });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 30_000,
        backoff: 100,
      });

      expect(policy.afterSuccess(event)).toStrictEqual({ kind: 'continue' });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'continue',
        timeout: 30_000,
      });
    });

    it('closes when enough contiguous failures happen', () => {
      const policy = new CircuitBreakerPolicy(usecaseInfo, 4, 1000, 30_000);
      const event = { time: 0, registryCacheAge: 0 };

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'retry',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 30_000,
        backoff: 100,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'retry',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 30_000,
        backoff: 200,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'retry',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 30_000,
        backoff: 400,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'abort',
        reason: 'circuit breaker is open',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'abort',
        reason: 'circuit breaker is open',
      });
    });

    it('half-closes when the reset timeout passes', () => {
      const policy = new CircuitBreakerPolicy(usecaseInfo, 4, 1000, 40);
      const event = { time: 0, registryCacheAge: 0 };

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'retry',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 40,
        backoff: 100,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'retry',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 40,
        backoff: 200,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'retry',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 40,
        backoff: 400,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'abort',
        reason: 'circuit breaker is open',
      });

      expect(
        policy.beforeExecution({ time: 1000, registryCacheAge: 0 })
      ).toStrictEqual({ kind: 'continue', timeout: 40 });
    });

    it('opens again from half-closed state when it fails', () => {
      const policy = new CircuitBreakerPolicy(usecaseInfo, 4, 1000, 40);
      const event = { time: 0, registryCacheAge: 0 };

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'retry',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 40,
        backoff: 100,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'retry',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 40,
        backoff: 200,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'retry',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 40,
        backoff: 400,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'abort',
        reason: 'circuit breaker is open',
      });

      expect(
        policy.beforeExecution({ time: 1000, registryCacheAge: 0 })
      ).toStrictEqual({ kind: 'continue', timeout: 40 });
      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'abort',
        reason: 'circuit breaker is open',
      });

      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'abort',
        reason: 'circuit breaker is open',
      });
    });

    it('closes fully from half-open state when enough requests succeed', () => {
      const policy = new CircuitBreakerPolicy(usecaseInfo, 4, 1000, 40);
      const event = { time: 0, registryCacheAge: 0 };

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'retry',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 40,
        backoff: 100,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'retry',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 40,
        backoff: 200,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'retry',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 40,
        backoff: 400,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'abort',
        reason: 'circuit breaker is open',
      });

      expect(
        policy.beforeExecution({ time: 1000, registryCacheAge: 0 })
      ).toStrictEqual({ kind: 'continue', timeout: 40 });
      expect(policy.afterSuccess(event)).toStrictEqual({ kind: 'continue' });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'retry',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 40,
        backoff: 100,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'retry',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 40,
        backoff: 200,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'retry',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 40,
        backoff: 400,
      });

      expect(policy.afterSuccess(event)).toStrictEqual({ kind: 'continue' });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 40,
        backoff: 200,
      });
    });

    it('resets correctly', () => {
      const policy = new CircuitBreakerPolicy(usecaseInfo, 4, 1000, 30_000);
      const event = { time: 0, registryCacheAge: 0 };

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'retry',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 30_000,
        backoff: 100,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'retry',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 30_000,
        backoff: 200,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'retry',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 30_000,
        backoff: 400,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'abort',
        reason: 'circuit breaker is open',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'abort',
        reason: 'circuit breaker is open',
      });

      policy.reset();
      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'retry',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 30_000,
        backoff: 100,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'retry',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 30_000,
        backoff: 200,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'retry',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 30_000,
        backoff: 400,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'abort',
        reason: 'circuit breaker is open',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'abort',
        reason: 'circuit breaker is open',
      });

      policy.reset();
      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'retry',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 30_000,
        backoff: 100,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'retry',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 30_000,
        backoff: 200,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'retry',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 30_000,
        backoff: 400,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'abort',
        reason: 'circuit breaker is open',
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'abort',
        reason: 'circuit breaker is open',
      });
    });
  });

  describe('FailurePolicyRouter', () => {
    const profileId = 'scope/name/usecase';
    const usecaseName = 'usecase';
    const usecaseSafety = 'safe';

    describe('setCurrentProvider', () => {
      it('sets current provider', () => {
        const router = new FailurePolicyRouter(
          { profileId, usecaseSafety, usecaseName },
          {},
          []
        );

        expect(router.getCurrentProvider()).toBeUndefined();

        router.setCurrentProvider('provider');

        expect(router.getCurrentProvider()).toBeDefined();
        expect(
          router.afterFailure({
            kind: 'network',
            issue: 'timeout',
            time: 0,
            registryCacheAge: 0,
          })
        ).toEqual({ kind: 'abort', reason: 'abort policy selected' });
      });
    });

    describe('beforeExecution', () => {
      it('throws if current provider is undefined', () => {
        const router = new FailurePolicyRouter(
          { profileId, usecaseSafety, usecaseName },
          {},
          []
        );
        expect(() =>
          router.beforeExecution({ time: 0, registryCacheAge: 0 })
        ).toThrowError(
          new Error('Property currentProvider is not set in Router instance')
        );
      });

      it('returns inner resolution', () => {
        const router = new FailurePolicyRouter(
          { profileId, usecaseSafety, usecaseName },
          {},
          []
        );
        router.setCurrentProvider('provider');

        expect(
          router.beforeExecution({ time: 0, registryCacheAge: 0 })
        ).toEqual({ kind: 'continue', timeout: 30_000 });
      });

      it('does not switch back - failover is not allowed', () => {
        const retryPolicy = new RetryPolicy({
          profileId,
          usecaseSafety,
          usecaseName,
        });
        const router = new FailurePolicyRouter(
          { profileId, usecaseSafety, usecaseName },
          {
            first: retryPolicy,
            second: new RetryPolicy({
              profileId,
              usecaseSafety,
              usecaseName,
            }),
            third: new AbortPolicy({ profileId, usecaseSafety, usecaseName }),
          },
          ['first', 'second', 'third']
        );

        //first provider broken
        retryPolicy.afterFailure({
          kind: 'network',
          issue: 'timeout',
          time: 0,
          registryCacheAge: 0,
        });

        //set current
        router.setCurrentProvider('third');

        //Disable failover
        router.setAllowFailover(false);

        expect(
          router.beforeExecution({ time: 0, registryCacheAge: 0 })
        ).toEqual({ kind: 'continue', timeout: 30_000 });
      });
      it('switches back to first functional provider with higher priority', () => {
        const retryPolicy = new RetryPolicy({
          profileId,
          usecaseSafety,
          usecaseName,
        });
        const router = new FailurePolicyRouter(
          { profileId, usecaseSafety, usecaseName },
          {
            first: retryPolicy,
            second: new RetryPolicy({
              profileId,
              usecaseSafety,
              usecaseName,
            }),
            third: new AbortPolicy({ profileId, usecaseSafety, usecaseName }),
          },
          ['first', 'second', 'third']
        );

        //first provider broken
        retryPolicy.afterFailure({
          kind: 'network',
          issue: 'timeout',
          time: 0,
          registryCacheAge: 0,
        });

        //set current
        router.setCurrentProvider('third');

        expect(
          router.beforeExecution({ time: 0, registryCacheAge: 0 })
        ).toEqual({
          kind: 'switch-provider',
          //Switch to second
          provider: 'second',
        });
      });

      it('switches back to functional provider with higher priority', () => {
        const router = new FailurePolicyRouter(
          { profileId, usecaseSafety, usecaseName },
          {
            first: new RetryPolicy({
              profileId,
              usecaseSafety,
              usecaseName,
            }),
            second: new RetryPolicy({
              profileId,
              usecaseSafety,
              usecaseName,
            }),
            third: new AbortPolicy({ profileId, usecaseSafety, usecaseName }),
          },
          ['first', 'second', 'third']
        );

        //set current
        router.setCurrentProvider('third');

        expect(
          router.beforeExecution({ time: 0, registryCacheAge: 0 })
        ).toEqual({
          kind: 'switch-provider',
          //Switch to second
          provider: 'first',
        });
      });
    });
    describe('afterFailure', () => {
      it('throws if current provider is undefined', () => {
        const router = new FailurePolicyRouter(
          { profileId, usecaseSafety, usecaseName },
          {},
          []
        );
        expect(() =>
          router.afterFailure({
            kind: 'network',
            issue: 'timeout',
            time: 0,
            registryCacheAge: 0,
          })
        ).toThrowError(
          new Error('Property currentProvider is not set in Router instance')
        );
      });

      it('returns inner resolution', () => {
        const router = new FailurePolicyRouter(
          { profileId, usecaseSafety, usecaseName },
          { first: new RetryPolicy({ profileId, usecaseSafety, usecaseName }) },
          ['first']
        );
        router.setCurrentProvider('first');

        expect(
          router.afterFailure({
            kind: 'network',
            issue: 'timeout',
            time: 0,
            registryCacheAge: 0,
          })
        ).toEqual({ kind: 'retry' });
      });

      it('aborts when there is not another provider', () => {
        const router = new FailurePolicyRouter(
          { profileId, usecaseSafety, usecaseName },
          { first: new AbortPolicy({ profileId, usecaseSafety, usecaseName }) },
          ['first']
        );
        router.setCurrentProvider('first');

        expect(
          router.afterFailure({
            kind: 'network',
            issue: 'timeout',
            time: 0,
            registryCacheAge: 0,
          })
        ).toEqual({ kind: 'abort', reason: 'no backup provider configured' });
      });

      it('switches to another provider with lesser priority', () => {
        const router = new FailurePolicyRouter(
          { profileId, usecaseSafety, usecaseName },
          {
            first: new AbortPolicy({ profileId, usecaseSafety, usecaseName }),
            second: new AbortPolicy({ profileId, usecaseSafety, usecaseName }),
            third: new AbortPolicy({ profileId, usecaseSafety, usecaseName }),
          },
          ['first', 'second', 'third']
        );
        router.setCurrentProvider('first');

        expect(
          router.afterFailure({
            kind: 'network',
            issue: 'timeout',
            time: 0,
            registryCacheAge: 0,
          })
        ).toEqual({ kind: 'switch-provider', provider: 'second' });
      });

      it('does nor switch to another provider filover not allowed', () => {
        const router = new FailurePolicyRouter(
          { profileId, usecaseSafety, usecaseName },
          {
            first: new AbortPolicy({ profileId, usecaseSafety, usecaseName }),
            second: new AbortPolicy({ profileId, usecaseSafety, usecaseName }),
            third: new AbortPolicy({ profileId, usecaseSafety, usecaseName }),
          },
          ['first', 'second', 'third']
        );
        router.setCurrentProvider('first');
        router.setAllowFailover(false);
        expect(
          router.afterFailure({
            kind: 'network',
            issue: 'timeout',
            time: 0,
            registryCacheAge: 0,
          })
        ).toEqual({ kind: 'abort', reason: 'abort policy selected' });
      });

      it('switches to first functional provider with lesser priority', () => {
        const retryPolicy = new RetryPolicy(
          {
            profileId,
            usecaseSafety,
            usecaseName,
          },
          1,
          60_000
        );

        const router = new FailurePolicyRouter(
          { profileId, usecaseSafety, usecaseName },
          {
            first: new AbortPolicy({ profileId, usecaseSafety, usecaseName }),
            second: retryPolicy,
            third: new AbortPolicy({ profileId, usecaseSafety, usecaseName }),
          },
          ['first', 'second', 'third']
        );
        retryPolicy.afterFailure({
          kind: 'network',
          issue: 'timeout',
          time: 0,
          registryCacheAge: 0,
        });

        router.setCurrentProvider('first');

        expect(
          router.afterFailure({
            kind: 'network',
            issue: 'timeout',
            time: 0,
            registryCacheAge: 0,
          })
        ).toEqual({ kind: 'switch-provider', provider: 'third' });
      });
    });
    describe('afterSuccess', () => {
      it('throws if current provider is undefined', () => {
        const router = new FailurePolicyRouter(
          { profileId, usecaseSafety, usecaseName },
          {},
          []
        );
        expect(() =>
          router.afterSuccess({ time: 0, registryCacheAge: 0 })
        ).toThrowError(
          new Error('Property currentProvider is not set in Router instance')
        );
      });

      it('returns inner resolution', () => {
        const router = new FailurePolicyRouter(
          { profileId, usecaseSafety, usecaseName },
          {
            first: new AbortPolicy({ profileId, usecaseSafety, usecaseName }),
          },
          ['first']
        );
        router.setCurrentProvider('first');

        expect(router.afterSuccess({ time: 0, registryCacheAge: 0 })).toEqual({
          kind: 'continue',
        });
      });
    });
  });
});
