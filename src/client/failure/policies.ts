import { Backoff, ExponentialBackoff } from '../../lib/backoff';
import {
  ExecutionFailure,
  ExecutionInfo,
  ExecutionSuccess,
  FailurePolicy,
  UsecaseInfo,
} from './policy';
import {
  ExecutionResolution,
  FailureResolution,
  SuccessResolution,
} from './resolution';

export class Router {
  constructor(
    private readonly providersOfUseCase: Record<string, FailurePolicy>,
    private readonly priority: string[],
    private currentProvider?: string
  ) { }

  public getCurrentProvider(): string | undefined {
    return this.currentProvider;
  }

  public setCurrentProvider(provider: string): void {
    // TODO: check if exists
    this.currentProvider = provider;
  }

  public beforeExecution(info: ExecutionInfo): ExecutionResolution {
    //TODO: export to function
    if (!this.currentProvider) {
      throw 'Property currentProvider is not set in Router instance';
    }
    if (!this.providersOfUseCase[this.currentProvider]) {
      throw `There is not any policy set for provider ${this.currentProvider} in Router instance`;
    }
    const innerResolution =
      this.providersOfUseCase[this.currentProvider].beforeExecution(info);

    return innerResolution;
  }

  public afterFailure(info: ExecutionFailure): FailureResolution {
    if (!this.currentProvider) {
      throw 'Property currentProvider is not set in Router instance';
    }
    if (!this.providersOfUseCase[this.currentProvider]) {
      throw `There is not any policy set for provider ${this.currentProvider} in Router instance`;
    }
    const innerResolution =
      this.providersOfUseCase[this.currentProvider].afterFailure(info);
    // console.log('router after fail', innerResolution)

    //TODO: some other checking logic?
    if (innerResolution.kind !== 'abort' || this.priority.length === 0) {
      return innerResolution;
    }
    const indexOfCurrentProvider = this.priority.indexOf(this.currentProvider);

    //Priority does not contain another (with lesser priority) provider
    if (indexOfCurrentProvider === this.priority.length) {
      //Abort/retry/continue??
      return { kind: 'abort', reason: 'no backup provider configured' };
    }

    //Fail if we are switching provider for the second time

    this.currentProvider = this.priority[indexOfCurrentProvider + 1];

    return { kind: 'switch-provider', provider: this.currentProvider };
  }

  public afterSuccess(info: ExecutionSuccess): SuccessResolution {
    if (!this.currentProvider) {
      throw 'Property currentProvider is not set in Router instance';
    }

    return this.providersOfUseCase[this.currentProvider].afterSuccess(info);
  }

  //TODO: Should we handle provider reset here?
  public reset(): void { }
}

/** Simple policy which aborts on the first failure */
export class AbortPolicy extends FailurePolicy {
  constructor(usecaseInfo: UsecaseInfo) {
    super(usecaseInfo);
  }

  override beforeExecution(_info: ExecutionInfo): ExecutionResolution {
    return { kind: 'continue', timeout: 30 };
  }

  override afterFailure(_info: ExecutionFailure): FailureResolution {
    return { kind: 'abort', reason: 'abort policy selected' };
  }

  override afterSuccess(_info: ExecutionSuccess): SuccessResolution {
    return { kind: 'continue' };
  }

  override reset(): void { }
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
  private lastCallTime: number;

  constructor(
    usecaseInfo: UsecaseInfo,
    public readonly maxContiguousRetries: number = 5,
    public readonly requestTimeout: number = 30,
    private readonly backoff: Backoff = new ExponentialBackoff(50, 2.0)
  ) {
    super(usecaseInfo);

    this.streak = 0;
    this.balance = 0;
    this.lastCallTime = 0;
  }

  override beforeExecution(info: ExecutionInfo): ExecutionResolution {
    // positive balance means no backoff
    if (this.balance >= 0) {
      return { kind: 'continue', timeout: this.requestTimeout };
    }

    // don't apply backoff if enough time has elapsed since then anyway
    const sinceLastCall = info.time - this.lastCallTime;
    const backoff = Math.max(0, this.backoff.current - sinceLastCall);

    return { kind: 'backoff', backoff: backoff, timeout: this.requestTimeout };
  }

  override afterFailure(info: ExecutionFailure): FailureResolution {
    // either reset to -1 or make the negative streak longer
    this.streak = Math.min(-1, this.streak - 1);
    this.lastCallTime = info.time;

    if (-this.streak > this.maxContiguousRetries) {
      // abort when we fail too much
      return { kind: 'abort', reason: 'max retries exceeded' };
    }

    this.balance -= 1;
    this.backoff.up();

    // otherwise retry
    return { kind: 'retry' };
  }

  override afterSuccess(info: ExecutionSuccess): SuccessResolution {
    this.streak = Math.max(1, this.streak + 1);
    this.lastCallTime = info.time;

    if (this.balance >= 0) {
      return { kind: 'continue' };
    }

    // there is some backoff to lower from previous failures
    this.balance += 1;
    this.backoff.down();

    return { kind: 'continue' };
  }

  override reset(): void {
    this.streak = 0;
    this.lastCallTime = 0;

    while (this.balance < 0) {
      this.backoff.down();
      this.balance += 1;
    }
  }
}

/**
 * Circuit breaker pattern
 *
 * The circuit breaker starts closed.
 * On a failure, an exponential backoff ramps up to the configured threshold. On success, the backoff ramps down the same way.
 *
 * If a streak of failures reaches the configured threshold the breaker trips. In this state, the breaker will abort any outgoing request
 * until a configured timeout is reached. After this timeout, the breaker goes into half-open state where any failure will trip it again.
 *
 * If a successful execution is detected from half-open state, the breaker closes again and is in the same state as at the beginning.
 */
export class CircuitBreakerPolicy extends FailurePolicy {
  private readonly inner: RetryPolicy;
  private state: 'closed' | 'open' | 'half-open';
  private openTime: number;

  constructor(
    usecaseInfo: UsecaseInfo,
    /** Number of contiguous failures before the breaker trips */
    failureThreshold: number,
    /** Reset timeout in milliseconds */
    private readonly resetTimeout: number,
    requestTimeout?: number,
    backoff?: Backoff
  ) {
    super(usecaseInfo);

    this.inner = new RetryPolicy(
      usecaseInfo,
      failureThreshold - 1,
      requestTimeout,
      backoff
    );

    this.state = 'closed';
    this.openTime = 0;
  }

  override beforeExecution(info: ExecutionInfo): ExecutionResolution {
    if (this.state === 'open') {
      if (info.time >= this.openTime + this.resetTimeout) {
        this.halfOpen();

        return { kind: 'continue', timeout: this.inner.requestTimeout };
      } else {
        return { kind: 'abort', reason: 'circuit breaker is open' };
      }
    }

    const innerResponse = this.inner.beforeExecution(info);

    if (innerResponse.kind === 'abort') {
      this.open(info.time);

      return { kind: 'abort', reason: 'circuit breaker is open' };
    }

    return innerResponse;
  }

  override afterFailure(info: ExecutionFailure): FailureResolution {
    if (this.state === 'half-open') {
      this.open(info.time);

      return { kind: 'abort', reason: 'circuit breaker is open' };
    }

    if (this.state === 'open') {
      throw new Error('Unreachable circuit breaker state');
    }

    const innerResponse = this.inner.afterFailure(info);

    if (innerResponse.kind === 'abort') {
      this.open(info.time);

      return { kind: 'abort', reason: 'circuit breaker is open' };
    }

    return innerResponse;
  }

  override afterSuccess(info: ExecutionSuccess): SuccessResolution {
    if (this.state === 'half-open') {
      this.close();
    }

    if (this.state === 'open') {
      throw new Error('Unreachable');
    }

    return this.inner.afterSuccess(info);
  }

  private open(time: number) {
    this.state = 'open';
    this.inner.reset();
    this.openTime = time;
  }

  private halfOpen() {
    this.state = 'half-open';
  }

  private close() {
    this.state = 'closed';
  }

  override reset(): void {
    this.inner.reset();
    this.state = 'closed';
    this.openTime = 0;
  }
}
