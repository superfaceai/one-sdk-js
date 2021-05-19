/** A usecase failure to be resolved */
export type UsecaseFailure = {
  /** Age of the registry (map/bind) cache */
  registryCacheAge: number;

  // TODO: some data about the failure like status code, etc
};

/** Abort the execution completely */
export type AbortResolution = {
  kind: 'abort';
};

/**
 * Retry the same configuration with a backoff
 *
 * In case of success, this acts as if returning continue but with a backoff
 */
export type BackoffResolution = {
  kind: 'backoff';
  /** Number of milliseconds to wait until retrying */
  backoff: number;
};

/** Recache data from (a possibly different) registry then retry */
export type RecacheResolution = {
  kind: 'recache';
  /** Optional url to a fallback registry to use for this recache request only */
  newRegistry?: string; // TODO: do we want this?
};

/** Fail over to another provider */
export type FailoverResolution = {
  kind: 'failover';
  /** Name of the provider to failover to */
  provider: string;
};

export type FailureResolution =
  | AbortResolution
  | BackoffResolution
  | RecacheResolution
  | FailoverResolution;

/** Reattempt the original provider after a previous failure and failover */
export type ReattemptResolution = {
  kind: 'reattempt';
};

/** Continue in the current configuration, no changes should be made */
export type ContinueResolution = {
  kind: 'continue';
};

export type SuccessResolution =
  | ContinueResolution
  | ReattemptResolution
  | BackoffResolution;

/**
 * Failure policy governs the behavior of SDK in face of execution (perform) failures.
 *
 * The task of automatization policy is to decide when to repeat a usecase perform, when to failover to a different provider
 * or when to reattempt going back to the original provider.
 *
 * Each instance of failure policy is associated with one instance of a client and one specific usecase for that client.
 */
export abstract class FailurePolicy {
  constructor(
    public readonly name: string,
    public readonly safety: 'safe' | 'unsafe' | 'idempotent'
  ) {}

  /**
   * Notifies this policy about a failed exeuction of a usecase.
   *
   * The policy decides what action to take next.
   */
  abstract resolveFailure(failure: UsecaseFailure): FailureResolution;

  /**
   * Notifies this policy about a successful execution of a usecase.
   *
   * The policy may use this to update its inner state or to reattempt the original provider.
   */
  abstract resolveSuccess(): SuccessResolution;
}
