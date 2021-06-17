import {
  ExecutionResolution,
  FailureResolution,
  SuccessResolution,
} from './resolution';

export type UsecaseInfo = {
  profileId: string;
  usecaseName: string;
  usecaseSafety: 'safe' | 'unsafe' | 'idempotent';
};

type BaseEvent = {
  /** Javascript (in milliseconds) timestamp of when the event happened */
  time: number;
  registryCacheAge: number;
};

export type ExecutionInfo = BaseEvent;

/** Network failure happens when no connection could even be open to the service. */
export type NetworkFailure = {
  kind: 'network';
  issue: 'unsigned-ssl' | 'dns' | 'timeout';
} & BaseEvent;

/**
 * Request failuer happens when the connection was open and a request was sent, but then no response or only a portion of the response was received,
 * either because of a timeout or abortion from the other side.
 */
export type RequestFailure = {
  kind: 'request';
  issue: 'abort' | 'timeout';
} & BaseEvent;

/** HTTP failure happens when a request was sent but the response contains an unexpected HTTP status code. */
export type HTTPFailure = {
  kind: 'http';
  /** HTTP status code */
  statusCode: number;
  // TODO: Maybe response headers? for example Retry-After
} & BaseEvent;

/** Information about execution failure */
export type ExecutionFailure = NetworkFailure | RequestFailure | HTTPFailure;

export type ExecutionSuccess = BaseEvent;

/**
 * Failure policy governs the behavior of SDK in face of execution (perform) failures.
 *
 * The task of this policy is to decide when to repeat a usecase perform, when to failover to a different provider
 * or when to reattempt going back to the original provider.
 *
 * Each instance of failure policy is associated with one instance of a client and one specific usecase for that client.
 * A such, an instance of policy can hold the state required to make future decitions based on any past events.
 *
 * The overall cycle is the following:
 * 1. The user requests a usecase perform
 * 2. Failure policy `beforeExecution` is called
 *     - May abort the execution
 *     - May specify a timeout or failover reattempt
 *     - May request a recache
 * 3. A bind is executed if it is not cached yet
 * 4. The usecase is performed
 * 5. If failed - `afterFailue` is called
 *     - May abort the execution
 *     - May retry, failover, etc. jumping back to 2.
 * 6. If succeeded  - `afterSuccess` is called, cycle ends
 */
export abstract class FailurePolicy {
  constructor(public readonly usecaseInfo: UsecaseInfo) {}

  /**
   * Notifies a policy that an execution is about to happen.
   *
   * The policy can decide on values for timeouts, orchestrate a failover reattempt or cancel the perform.
   */
  abstract beforeExecution(info: ExecutionInfo): ExecutionResolution;

  /**
   * Notifies this policy about a failed exeuction of a usecase.
   *
   * The policy may use this to update its inner state, open a circuit breaker, send a report, etc.
   */
  abstract afterFailure(info: ExecutionFailure): FailureResolution;

  /**
   * Notifies this policy about a successful execution of a usecase.
   *
   * The policy may use this to update its inner state, close a circuit breaker, etc.
   */
  abstract afterSuccess(info: ExecutionSuccess): SuccessResolution;

  /**
   * Resets this policy as if it was just created.
   */
  abstract reset(): void;
}
