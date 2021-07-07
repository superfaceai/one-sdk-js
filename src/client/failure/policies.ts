import { Backoff, ExponentialBackoff } from '../../lib/backoff';
import {
  ExecutionFailure,
  ExecutionInfo,
  ExecutionSuccess,
  FailurePolicy,
  UsecaseInfo,
} from './policy';
import {
  AbortResolution,
  ExecutionResolution,
  FailureResolution,
  SuccessResolution,
  SwitchProviderResolution,
} from './resolution';

export class FailurePolicyRouter {
  private currentProvider: string | undefined;
  private allowFailover = true;

  constructor(
    private readonly usecaseInfo: UsecaseInfo,
    private readonly providersOfUseCase: Record<string, FailurePolicy>,
    private readonly priority: string[]
  ) {}

  private switchProviders(
    info: ExecutionInfo
  ): AbortResolution | SwitchProviderResolution {
    if (!this.currentProvider) {
      throw new Error('Property currentProvider is not set in Router instance');
    }

    console.timeLog(
      'STATE',
      'current ',
      this.currentProvider,
      ' priority ',
      this.priority,
      ' providers ',
      this.providersOfUseCase,
      ' found provider'
    );

    //Try to switch providers
    const indexOfCurrentProvider = this.priority.indexOf(this.currentProvider);
    const provider = this.priority
      .filter((_p: string, i: number) => i > indexOfCurrentProvider)
      .find((p: string) => {
        return this.providersOfUseCase[p]
          ? this.providersOfUseCase[p].beforeExecution(info).kind === 'continue'
          : true;
      });

    //Priority does not contain another (with lesser priority) provider
    if (!provider) {
      return { kind: 'abort', reason: 'no backup provider configured' };
    }
    this.currentProvider = provider;
    console.timeLog('STATE', 'sw to ', this.currentProvider);

    return { kind: 'switch-provider', provider: this.currentProvider };
  }

  public getCurrentProvider(): string | undefined {
    return this.currentProvider;
  }

  public setAllowFailover(allowFailover: boolean): void {
    this.allowFailover = allowFailover;
  }

  public setCurrentProvider(provider: string): void {
    // create a policy ad-hoc if a provider that hasn't been preconfigured was provided
    if (!(provider in this.providersOfUseCase)) {
      this.providersOfUseCase[provider] = new AbortPolicy(this.usecaseInfo);
    }

    this.currentProvider = provider;
  }

  public beforeExecution(info: ExecutionInfo): ExecutionResolution {
    if (!this.currentProvider) {
      throw new Error('Property currentProvider is not set in Router instance');
    }

    //Try to switch back to previous provider
    if (
      this.allowFailover &&
      this.priority.length > 0 &&
      this.currentProvider !== this.priority[0]
    ) {
      const indexOfCurrentProvider = this.priority.indexOf(
        this.currentProvider
      );

      const provider = this.priority
        .filter((_p: string, i: number) => i < indexOfCurrentProvider)
        .find((p: string) =>
          this.providersOfUseCase[p]
            ? this.providersOfUseCase[p].beforeExecution(info).kind ===
              'continue'
            : true
        );

      //TODO: solve AbortPolicy infinite loop problem
      //Switch back to previous but do not switch back to AbortPolicy
      if (
        provider &&
        !(this.providersOfUseCase[provider] instanceof AbortPolicy)
      ) {
        console.timeLog('STATE', 'switch forward to ', this.currentProvider);

        return {
          kind: 'switch-provider',
          provider,
        };
      }
    }
    const innerResolution =
      this.providersOfUseCase[this.currentProvider].beforeExecution(info);

    if (
      this.allowFailover &&
      innerResolution.kind === 'abort' &&
      this.priority.length > 0
    ) {
      console.timeLog(
        'STATE',
        'allow',
        this.allowFailover,
        ' prio ',
        this.priority,
        'be cb inner return ',
        innerResolution,
        'cur ',
        this.currentProvider
      );

      return this.switchProviders(info);
    }
    console.timeLog('STATE', 'RETURN FIN', innerResolution);

    return innerResolution;
  }

  public afterFailure(info: ExecutionFailure): FailureResolution {
    if (!this.currentProvider) {
      throw new Error('Property currentProvider is not set in Router instance');
    }

    const innerResolution =
      this.providersOfUseCase[this.currentProvider].afterFailure(info);

    //TODO: some other checking logic?
    if (
      !this.allowFailover ||
      innerResolution.kind !== 'abort' ||
      this.priority.length === 0
    ) {
      return innerResolution;
    }

    return this.switchProviders(info);
  }

  public afterSuccess(info: ExecutionSuccess): SuccessResolution {
    if (!this.currentProvider) {
      throw new Error('Property currentProvider is not set in Router instance');
    }

    return this.providersOfUseCase[this.currentProvider].afterSuccess(info);
  }

  public reset(): void {
    this.currentProvider = this.priority[0];
    for (const policy of Object.values(this.providersOfUseCase)) {
      policy.reset();
    }
  }
}

/** Simple policy which aborts on the first failure */
export class AbortPolicy extends FailurePolicy {
  constructor(usecaseInfo: UsecaseInfo) {
    super(usecaseInfo);
  }

  override beforeExecution(_info: ExecutionInfo): ExecutionResolution {
    return { kind: 'continue', timeout: 30_000 };
  }

  override afterFailure(_info: ExecutionFailure): FailureResolution {
    //TODO: Eda said this maybe should be continue
    return { kind: 'abort', reason: 'abort policy selected' };
  }

  override afterSuccess(_info: ExecutionSuccess): SuccessResolution {
    return { kind: 'continue' };
  }

  override reset(): void {}
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
    public readonly requestTimeout: number = 30_000,
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
      console.timeLog('STATE', 'retry policy BE contine');

      return { kind: 'continue', timeout: this.requestTimeout };
    }

    // don't apply backoff if enough time has elapsed since then anyway
    const sinceLastCall = info.time - this.lastCallTime;
    const backoff = Math.max(0, this.backoff.current - sinceLastCall);
    console.timeLog('STATE', 'retry policy BE backoff');
    console.timeLog('STATE', 'retry policy BE backoff');

    return { kind: 'backoff', backoff: backoff, timeout: this.requestTimeout };
  }

  override afterFailure(info: ExecutionFailure): FailureResolution {
    // either reset to -1 or make the negative streak longer
    this.streak = Math.min(-1, this.streak - 1);
    this.lastCallTime = info.time;

    if (-this.streak > this.maxContiguousRetries) {
      // abort when we fail too much
      console.timeLog('STATE', 'retry policy AF fail to much');

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
        console.timeLog('STATE', 'CB BE contine');

        return { kind: 'continue', timeout: this.inner.requestTimeout };
      } else {
        console.timeLog('STATE', 'CB BE abort first');

        return { kind: 'abort', reason: 'circuit breaker is open' };
      }
    }

    const innerResponse = this.inner.beforeExecution(info);

    if (innerResponse.kind === 'abort') {
      this.open(info.time);
      console.timeLog('STATE', 'CB BE abort second');

      return { kind: 'abort', reason: 'circuit breaker is open' };
    }

    return innerResponse;
  }

  override afterFailure(info: ExecutionFailure): FailureResolution {
    if (this.state === 'half-open') {
      this.open(info.time);
      console.timeLog('STATE', 'CB AF abort first');

      return { kind: 'abort', reason: 'circuit breaker is open' };
    }

    if (this.state === 'open') {
      throw new Error('Unreachable circuit breaker state');
    }

    const innerResponse = this.inner.afterFailure(info);

    if (innerResponse.kind === 'abort') {
      this.open(info.time);
      console.timeLog('STATE', 'CB AF abort second');

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
