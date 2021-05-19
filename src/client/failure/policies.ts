import { Backoff, ExponentialBackoff } from '../../lib/backoff';
import {
  FailurePolicy,
  FailureResolution,
  SuccessResolution,
  UsecaseFailure,
} from './policy';

/** Simple policy which aborts on the first failure */
export class AbortPolicy extends FailurePolicy {
  constructor(name: string, safety: 'safe' | 'unsafe' | 'idempotent') {
    super(name, safety);
  }

  resolveFailure(_failure: UsecaseFailure): FailureResolution {
    return { kind: 'abort' };
  }

  resolveSuccess(): SuccessResolution {
    return { kind: 'continue' };
  }
}

/** Simple retry policy with exponential backoff */
export class RetryPolicy extends FailurePolicy {
  /**
   * Counts the length of the current streak of actions
   *
   * Negative means failures, positive means successes
   */
  private streak: number;
  /** Counts the current balace of .up() and .down() calls to backoff */
  private balance: number;

  constructor(
    name: string,
    safety: 'safe' | 'unsafe' | 'idempotent',
    private readonly maxContiguousRetries: number = 5,
    private readonly backoff: Backoff = new ExponentialBackoff(
      50,
      2.0,
      100,
      undefined
    )
  ) {
    super(name, safety);

    this.streak = 0;
    this.balance = 1;
  }

  resolveFailure(_failure: UsecaseFailure): FailureResolution {
    // either reset to -1 or make the negative streak longer
    this.streak = Math.min(-1, this.streak - 1);

    if (-this.streak > this.maxContiguousRetries) {
      // abort when we fail too much
      return { kind: 'abort' };
    }
    this.balance -= 1;

    // otherwise just backoff
    return { kind: 'backoff', backoff: this.backoff.up() };
  }

  resolveSuccess(): SuccessResolution {
    this.streak = Math.max(1, this.streak + 1);

    if (this.balance >= 0) {
      return { kind: 'continue' };
    }
    this.balance += 1;

    // there is some backoff to lower from previous failures
    return { kind: 'backoff', backoff: this.backoff.down() };
  }
}
