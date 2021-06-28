import { AbortPolicy, CircuitBreakerPolicy, RetryPolicy } from './policies';
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
        kind: 'backoff',
        backoff: 100,
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        backoff: 100,
        timeout: 30,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'backoff',
        backoff: 200,
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        backoff: 200,
        timeout: 30,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'backoff',
        backoff: 400,
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        backoff: 400,
        timeout: 30,
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
        kind: 'backoff',
        backoff: 100,
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        backoff: 100,
        timeout: 30,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'backoff',
        backoff: 200,
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        backoff: 200,
        timeout: 30,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'backoff',
        backoff: 400,
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        backoff: 400,
        timeout: 30,
      });

      expect(policy.afterSuccess(event)).toStrictEqual({ kind: 'continue' });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        backoff: 200,
        timeout: 30,
      });

      expect(policy.afterSuccess(event)).toStrictEqual({ kind: 'continue' });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        backoff: 100,
        timeout: 30,
      });

      expect(policy.afterSuccess(event)).toStrictEqual({ kind: 'continue' });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'continue',
        timeout: 30,
      });
    });

    it('backsoff after successes', () => {
      const policy = new RetryPolicy(usecaseInfo, 3);
      const event = { time: 0, registryCacheAge: 0 };

      expect(policy.afterSuccess(event)).toStrictEqual({ kind: 'continue' });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'continue',
        timeout: 30,
      });

      expect(policy.afterSuccess(event)).toStrictEqual({ kind: 'continue' });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'continue',
        timeout: 30,
      });

      expect(policy.afterSuccess(event)).toStrictEqual({ kind: 'continue' });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'continue',
        timeout: 30,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'backoff',
        backoff: 100,
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        backoff: 100,
        timeout: 30,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'backoff',
        backoff: 200,
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        backoff: 200,
        timeout: 30,
      });

      expect(policy.afterSuccess(event)).toStrictEqual({ kind: 'continue' });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        backoff: 100,
        timeout: 30,
      });

      expect(policy.afterSuccess(event)).toStrictEqual({ kind: 'continue' });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'continue',
        timeout: 30,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'backoff',
        backoff: 100,
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        backoff: 100,
        timeout: 30,
      });

      expect(policy.afterSuccess(event)).toStrictEqual({ kind: 'continue' });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'continue',
        timeout: 30,
      });
    });

    it('resets correctly', () => {
      const policy = new RetryPolicy(usecaseInfo, 3);
      const event = { time: 0, registryCacheAge: 0 };

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'backoff',
        backoff: 100,
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        backoff: 100,
        timeout: 30,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'backoff',
        backoff: 200,
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        backoff: 200,
        timeout: 30,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'backoff',
        backoff: 400,
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        backoff: 400,
        timeout: 30,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'abort',
        reason: 'max retries exceeded',
      });

      policy.reset();
      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'backoff',
        backoff: 100,
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        backoff: 100,
        timeout: 30,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'backoff',
        backoff: 200,
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        backoff: 200,
        timeout: 30,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'backoff',
        backoff: 400,
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        backoff: 400,
        timeout: 30,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'abort',
        reason: 'max retries exceeded',
      });

      policy.reset();
      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'backoff',
        backoff: 100,
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        backoff: 100,
        timeout: 30,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'backoff',
        backoff: 200,
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        backoff: 200,
        timeout: 30,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'backoff',
        backoff: 400,
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        backoff: 400,
        timeout: 30,
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
      const policy = new CircuitBreakerPolicy(usecaseInfo, 4, 1000, 30);
      const event = { time: 0, registryCacheAge: 0 };

      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'continue',
        timeout: 30,
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'continue',
        timeout: 30,
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'continue',
        timeout: 30,
      });
    });

    it('stays closed when not enough contiguous failures happen', () => {
      const policy = new CircuitBreakerPolicy(usecaseInfo, 4, 1000, 30);
      const event = { time: 0, registryCacheAge: 0 };

      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'continue',
        timeout: 30,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'backoff',
        backoff: 100,
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 30,
        backoff: 100,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'backoff',
        backoff: 200,
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 30,
        backoff: 200,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'backoff',
        backoff: 400,
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 30,
        backoff: 400,
      });

      expect(policy.afterSuccess(event)).toStrictEqual({ kind: 'continue' });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 30,
        backoff: 200,
      });

      expect(policy.afterSuccess(event)).toStrictEqual({ kind: 'continue' });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 30,
        backoff: 100,
      });

      expect(policy.afterSuccess(event)).toStrictEqual({ kind: 'continue' });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'continue',
        timeout: 30,
      });
    });

    it('closes when enough contiguous failures happen', () => {
      const policy = new CircuitBreakerPolicy(usecaseInfo, 4, 1000, 30);
      const event = { time: 0, registryCacheAge: 0 };

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'backoff',
        backoff: 100,
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 30,
        backoff: 100,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'backoff',
        backoff: 200,
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 30,
        backoff: 200,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'backoff',
        backoff: 400,
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 30,
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
        kind: 'backoff',
        backoff: 100,
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 40,
        backoff: 100,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'backoff',
        backoff: 200,
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 40,
        backoff: 200,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'backoff',
        backoff: 400,
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
        kind: 'backoff',
        backoff: 100,
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 40,
        backoff: 100,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'backoff',
        backoff: 200,
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 40,
        backoff: 200,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'backoff',
        backoff: 400,
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
        kind: 'backoff',
        backoff: 100,
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 40,
        backoff: 100,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'backoff',
        backoff: 200,
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 40,
        backoff: 200,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'backoff',
        backoff: 400,
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
        kind: 'backoff',
        backoff: 100,
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 40,
        backoff: 100,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'backoff',
        backoff: 200,
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 40,
        backoff: 200,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'backoff',
        backoff: 400,
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
      const policy = new CircuitBreakerPolicy(usecaseInfo, 4, 1000, 30);
      const event = { time: 0, registryCacheAge: 0 };

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'backoff',
        backoff: 100,
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 30,
        backoff: 100,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'backoff',
        backoff: 200,
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 30,
        backoff: 200,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'backoff',
        backoff: 400,
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 30,
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
        kind: 'backoff',
        backoff: 100,
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 30,
        backoff: 100,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'backoff',
        backoff: 200,
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 30,
        backoff: 200,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'backoff',
        backoff: 400,
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 30,
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
        kind: 'backoff',
        backoff: 100,
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 30,
        backoff: 100,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'backoff',
        backoff: 200,
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 30,
        backoff: 200,
      });

      expect(policy.afterFailure(failure)).toStrictEqual({
        kind: 'backoff',
        backoff: 400,
      });
      expect(policy.beforeExecution(event)).toStrictEqual({
        kind: 'backoff',
        timeout: 30,
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
});
