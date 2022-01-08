import { UnexpectedError } from '../../internal/errors';
import { Backoff, ExponentialBackoff } from '../../lib/backoff';
import {
  ExecutionFailure,
  ExecutionInfo,
  ExecutionSuccess,
  FailurePolicy,
  FailurePolicyReason,
  UsecaseInfo,
} from './policy';
import {
  ExecutionResolution,
  FailureResolution,
  SuccessResolution,
  SwitchProviderResolution,
} from './resolution';

export class FailurePolicyRouter {
  private currentProvider: string | undefined;
  private allowFailover = true;

  private readonly providersOfUseCase: Record<string, FailurePolicy>;

  constructor(
    private readonly instantiateFailurePolicy: (
      provider: string
    ) => FailurePolicy,
    private readonly priority: string[]
  ) {
    this.providersOfUseCase = Object.fromEntries(
      priority.map(provider => [provider, instantiateFailurePolicy(provider)])
    );
  }

  public getCurrentProvider(): string | undefined {
    return this.currentProvider;
  }

  public setCurrentProvider(provider: string): void {
    // create a policy ad-hoc if a provider that hasn't been preconfigured was provided
    if (!(provider in this.providersOfUseCase)) {
      this.providersOfUseCase[provider] =
        this.instantiateFailurePolicy(provider);
    }

    this.currentProvider = provider;
  }

  public setAllowFailover(allowFailover: boolean): void {
    this.allowFailover = allowFailover;
  }

  private attemptSwitch(
    info: ExecutionInfo,
    providers: string[],
    reason: FailurePolicyReason
  ): SwitchProviderResolution | undefined {
    // find the first previous provider that doesn't abort
    const newProvider = providers.find(
      provider =>
        this.providersOfUseCase[provider].beforeExecution(info).kind ===
        'continue'
    );

    if (newProvider === undefined) {
      return undefined;
    }

    this.setCurrentProvider(newProvider);

    return { kind: 'switch-provider', provider: newProvider, reason };
  }

  private attemptFailover(
    info: ExecutionInfo,
    reason: FailurePolicyReason
  ): SwitchProviderResolution | undefined {
    if (!this.currentProvider) {
      throw new UnexpectedError(
        'Property currentProvider is not set in Router instance'
      );
    }

    if (!this.allowFailover) {
      return undefined;
    }

    const previousProviders = this.priority.slice(
      this.priority.indexOf(this.currentProvider) + 1
    );

    return this.attemptSwitch(info, previousProviders, reason);
  }

  private attemptFailoverRestore(
    info: ExecutionInfo
  ): SwitchProviderResolution | undefined {
    if (!this.currentProvider) {
      throw new UnexpectedError(
        'Property currentProvider is not set in Router instance'
      );
    }

    if (!this.allowFailover || info.checkFailoverRestore !== true) {
      return undefined;
    }

    const previousProviders = this.priority
      .slice(0, this.priority.indexOf(this.currentProvider))
      .filter(
        // TODO: Temporary hack to avoid infinite switch loops
        // this needs to be solved globally
        provider => !(this.providersOfUseCase[provider] instanceof AbortPolicy)
      );

    return this.attemptSwitch(
      info,
      previousProviders,
      FailurePolicyReason.fromPolicyReason('Provider failover restore')
    );
  }

  private handleFailover(
    info: ExecutionInfo,
    innerResolution: ExecutionResolution
  ): ExecutionResolution;
  private handleFailover(
    info: ExecutionInfo,
    innerResolution: FailureResolution
  ): FailureResolution;
  private handleFailover(
    info: ExecutionInfo,
    innerResolution: ExecutionResolution | FailureResolution
  ): ExecutionResolution | FailureResolution {
    if (innerResolution.kind === 'abort') {
      const failover = this.attemptFailover(info, innerResolution.reason);
      if (failover === undefined) {
        return {
          kind: 'abort',
          reason: innerResolution.reason.addPrefixMessage(
            'No backup provider available'
          ),
        };
      }

      return failover;
    }

    return innerResolution;
  }

  public beforeExecution(info: ExecutionInfo): ExecutionResolution {
    if (!this.currentProvider) {
      throw new UnexpectedError(
        'Property currentProvider is not set in Router instance'
      );
    }

    const failoverRestore = this.attemptFailoverRestore(info);
    if (failoverRestore !== undefined) {
      return failoverRestore;
    }

    const innerResolution =
      this.providersOfUseCase[this.currentProvider].beforeExecution(info);

    return this.handleFailover(info, innerResolution);
  }

  public afterFailure(info: ExecutionFailure): FailureResolution {
    if (!this.currentProvider) {
      throw new UnexpectedError(
        'Property currentProvider is not set in Router instance'
      );
    }

    const innerResolution =
      this.providersOfUseCase[this.currentProvider].afterFailure(info);

    return this.handleFailover(
      { ...info, checkFailoverRestore: false },
      innerResolution
    );
  }

  public afterSuccess(info: ExecutionSuccess): SuccessResolution {
    if (!this.currentProvider) {
      throw new UnexpectedError(
        'Property currentProvider is not set in Router instance'
      );
    }

    return this.providersOfUseCase[this.currentProvider].afterSuccess(info);
  }

  public reset(): void {
    this.setCurrentProvider(this.priority[0]);
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

  override afterFailure(info: ExecutionFailure): FailureResolution {
    return {
      kind: 'abort',
      reason: FailurePolicyReason.fromExecutionFailure(info),
    };
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
      return {
        kind: 'abort',
        reason: FailurePolicyReason.fromExecutionFailure(info).addPrefixMessage(
          `Max (${this.maxContiguousRetries}) retries exceeded.`
        ),
      };
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
        // TODO: more user friendly message
        return {
          kind: 'abort',
          reason: FailurePolicyReason.fromPolicyReason(
            'Circuit breaker is open'
          ),
        };
      }
    }

    const innerResponse = this.inner.beforeExecution(info);

    if (innerResponse.kind === 'abort') {
      this.open(info.time);

      // TODO: more user friendly message
      return {
        kind: 'abort',
        reason: FailurePolicyReason.fromPolicyReason('Circuit breaker is open'),
      };
    }

    return innerResponse;
  }

  override afterFailure(info: ExecutionFailure): FailureResolution {
    if (this.state === 'half-open') {
      this.open(info.time);

      return {
        kind: 'abort',
        reason: FailurePolicyReason.fromExecutionFailure(info).addPrefixMessage(
          'Circuit breaker is open'
        ),
      };
    }

    if (this.state === 'open') {
      throw new UnexpectedError('Unreachable circuit breaker state');
    }

    const innerResponse = this.inner.afterFailure(info);

    if (innerResponse.kind === 'abort') {
      this.open(info.time);

      return {
        kind: 'abort',
        reason: FailurePolicyReason.fromExecutionFailure(info).addPrefixMessage(
          'Circuit breaker is open'
        ),
      };
    }

    return innerResponse;
  }

  override afterSuccess(info: ExecutionSuccess): SuccessResolution {
    if (this.state === 'half-open') {
      this.close();
    }

    if (this.state === 'open') {
      throw new UnexpectedError('Unreachable');
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
