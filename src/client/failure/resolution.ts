import { FailurePolicyReason } from './policy';

/** Additional common configuration for making requests. */
export type RequestConfiguration = {
  /** Timeout for the request after which the request is aborted and a failure is reported. */
  timeout: number;
};

/**
 * Abort the execution completely.
 *
 * This may be returned from:
 * * `beforeExecute`: For example circuit breaker
 * * `afterFailure`: Circuit breaker, max retries exhausted, etc.
 */
export type AbortResolution = {
  kind: 'abort';
  /** Reason why the execution was aborted. */
  reason: FailurePolicyReason;
};

/**
 * Retry the execution, possibly with a backoff.
 *
 * This may be returned from:
 * * `afterFailure`
 */
export type RetryResolution = {
  kind: 'retry';
};

/**
 * Backoff the execution.
 *
 * This may be returned from:
 * * `beforeExecution`
 */
export type BackoffResolution = {
  kind: 'backoff';
  /** Number of milliseconds to wait until executing */
  backoff: number;
};

/**
 * Recache before executing.
 *
 * This may be returned from:
 * * `beforeExecution`
 */
export type RecacheResolution = {
  kind: 'recache';
  /** Optional url to a fallback registry to use for this recache request only */
  newRegistry?: string; // TODO: do we want this?
  /** Reason that caused this recache. */
  reason: FailurePolicyReason;
};

/**
 * Switch to a different provider.
 *
 * This may be returned from:
 * * `beforeExecution`: When a failover happens or when going back is to be reattempted.
 */
export type SwitchProviderResolution = {
  kind: 'switch-provider';
  provider: string;
  /** Reason that caused this switch. */
  reason: FailurePolicyReason;
};

/**
 * Continue in the current configuration, no changes should be made
 *
 * This may be returned from:
 * * `beforeExecution`
 * * `afterFailure`
 * * `afterSuccess`
 */
export type ContinueResolution = {
  kind: 'continue';
};

export type ExecutionResolution =
  | (RequestConfiguration & (ContinueResolution | BackoffResolution))
  | AbortResolution
  | RecacheResolution
  | SwitchProviderResolution;

export type FailureResolution =
  | AbortResolution
  | RetryResolution
  | ContinueResolution
  | RecacheResolution
  | SwitchProviderResolution;

export type SuccessResolution = ContinueResolution;
