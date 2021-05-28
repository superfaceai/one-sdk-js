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
  reason: string;
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
};

/**
 * Continue in the current configuration, no changes should be made
 *
 * This may be returned from:
 * * `beforeExecution`
 * * `afterSuccess`
 */
export type ContinueResolution = {
  kind: 'continue';
};

export type ExecutionResolution =
  | (RequestConfiguration &
      (ContinueResolution | BackoffResolution | RecacheResolution))
  | AbortResolution
  | SwitchProviderResolution;

export type FailureResolution = AbortResolution | RetryResolution;

export type SuccessResolution = ContinueResolution;
