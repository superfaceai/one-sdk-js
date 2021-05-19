import { AbortPolict, RetryPolicy } from './policies';

describe('failure policies', () => {
  describe('abort policy', () => {
    const policy = new AbortPolict('test', 'safe');
    const failure = { registryCacheAge: 0 };

    it('always aborts on failure', () => {
      expect(policy.resolveFailure(failure)).toStrictEqual({ kind: 'abort' });
      expect(policy.resolveFailure(failure)).toStrictEqual({ kind: 'abort' });
      expect(policy.resolveFailure(failure)).toStrictEqual({ kind: 'abort' });
    });

    it('always continues on success', () => {
      expect(policy.resolveSuccess()).toStrictEqual({ kind: 'continue' });
      expect(policy.resolveSuccess()).toStrictEqual({ kind: 'continue' });
      expect(policy.resolveSuccess()).toStrictEqual({ kind: 'continue' });
    });
  });

  describe('backoff policy', () => {
    const failure = { registryCacheAge: 0 };

    it('aborts after configured number of retries', () => {
      const policy = new RetryPolicy('test', 'safe', 3);

      expect(policy.resolveFailure(failure)).toStrictEqual({
        kind: 'backoff',
        backoff: 100,
      });
      expect(policy.resolveFailure(failure)).toStrictEqual({
        kind: 'backoff',
        backoff: 200,
      });
      expect(policy.resolveFailure(failure)).toStrictEqual({
        kind: 'backoff',
        backoff: 400,
      });

      expect(policy.resolveFailure(failure)).toStrictEqual({ kind: 'abort' });
    });

    it('continues without failures', () => {
      const policy = new RetryPolicy('test', 'unsafe', 3);

      expect(policy.resolveSuccess()).toStrictEqual({ kind: 'continue' });
      expect(policy.resolveSuccess()).toStrictEqual({ kind: 'continue' });
      expect(policy.resolveSuccess()).toStrictEqual({ kind: 'continue' });
    });

    it('backs down after failures', () => {
      const policy = new RetryPolicy('test', 'idempotent', 3);

      expect(policy.resolveFailure(failure)).toStrictEqual({
        kind: 'backoff',
        backoff: 100,
      });
      expect(policy.resolveFailure(failure)).toStrictEqual({
        kind: 'backoff',
        backoff: 200,
      });
      expect(policy.resolveFailure(failure)).toStrictEqual({
        kind: 'backoff',
        backoff: 400,
      });

      expect(policy.resolveSuccess()).toStrictEqual({
        kind: 'backoff',
        backoff: 200,
      });
      expect(policy.resolveSuccess()).toStrictEqual({
        kind: 'backoff',
        backoff: 100,
      });
      expect(policy.resolveSuccess()).toStrictEqual({ kind: 'continue' });
    });

    it('backsoff after successes', () => {
      const policy = new RetryPolicy('test', 'unsafe', 3);

      expect(policy.resolveSuccess()).toStrictEqual({ kind: 'continue' });
      expect(policy.resolveSuccess()).toStrictEqual({ kind: 'continue' });
      expect(policy.resolveSuccess()).toStrictEqual({ kind: 'continue' });

      expect(policy.resolveFailure(failure)).toStrictEqual({
        kind: 'backoff',
        backoff: 100,
      });
      expect(policy.resolveFailure(failure)).toStrictEqual({
        kind: 'backoff',
        backoff: 200,
      });

      expect(policy.resolveSuccess()).toStrictEqual({
        kind: 'backoff',
        backoff: 100,
      });
      expect(policy.resolveSuccess()).toStrictEqual({ kind: 'continue' });
    });
  });
});
