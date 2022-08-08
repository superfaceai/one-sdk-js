import { SDKExecutionError } from '../../../lib';
import type { HttpResponse } from '../../interpreter';
import type {
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

export type ExecutionInfo = BaseEvent & {
  /**
   * Flag indicating whether the policy should run failover-restore logic.
   *
   * This can be used to inhibit failover-restores in the middle of a perform.
   */
  checkFailoverRestore?: boolean;
};

/** Network failure happens when no connection could even be open to the service. */
export type NetworkFailure = {
  kind: 'network';
  issue: 'unsigned-ssl' | 'dns' | 'timeout' | 'reject';
} & BaseEvent;

/**
 * Request failure happens when the connection was open and a request was sent, but then no response or only a portion of the response was received,
 * either because of a timeout or abortion from the other side.
 */
export type RequestFailure = {
  kind: 'request';
  issue: 'abort' | 'timeout';
} & BaseEvent;

/** HTTP failure happens when a request was sent but the response contains an unexpected HTTP status code. */
export type HTTPFailure = {
  kind: 'http';
  response: HttpResponse;
} & BaseEvent;

export type UnknownFailure = {
  kind: 'unknown';
  originalError: Error;
} & BaseEvent;

export type BindFailure = {
  kind: 'bind';
  originalError: Error;
} & BaseEvent;

/** Information about execution failure */
export type ExecutionFailure =
  | NetworkFailure
  | RequestFailure
  | HTTPFailure
  | UnknownFailure
  | BindFailure;

export type ExecutionSuccess = BaseEvent;

type FailurePolicyReasonData =
  | {
      kind: 'failure';
      failure: ExecutionFailure;
    }
  | {
      kind: 'policy';
      reason: string;
    };
export class FailurePolicyReason {
  private prefixMessages: string[] = [];

  private constructor(public readonly data: FailurePolicyReasonData) {}

  public static fromExecutionFailure(
    failure: ExecutionFailure
  ): FailurePolicyReason {
    return new FailurePolicyReason({ kind: 'failure', failure });
  }

  public static fromPolicyReason(reason: string): FailurePolicyReason {
    return new FailurePolicyReason({ kind: 'policy', reason });
  }

  public addPrefixMessage(message: string): this {
    this.prefixMessages.unshift(message);

    return this;
  }

  public get message(): string {
    return this.toString();
  }

  public toString(): string {
    const prefix = this.prefixMessages.join(': ');

    if (this.data.kind === 'failure') {
      return `[${new Date(
        this.data.failure.time
      ).toISOString()}] ${prefix}: ${FailurePolicyReason.failureToString(
        this.data.failure
      )}`;
    } else {
      return `${prefix}: ${this.data.reason}`;
    }
  }

  public toError(): Error {
    switch (this.data.kind) {
      case 'failure':
        return new SDKExecutionError(
          FailurePolicyReason.failureToString(this.data.failure),
          [
            `At ${new Date(this.data.failure.time).toISOString()}`,
            this.prefixMessages.join(': '),
          ],
          []
        );

      case 'policy':
        return new SDKExecutionError(
          `Failure policy aborted with reason:' ${this.data.reason}`,
          [this.prefixMessages.join(': ')],
          ['Check that the failure policy is correctly configured']
        );
    }
  }

  private static failureToString(failure: ExecutionFailure): string {
    if (failure.kind === 'http') {
      return `Request ended with ${failure.kind} error, status code: ${failure.response.statusCode}`;
    } else if (failure.kind === 'request' || failure.kind === 'network') {
      return `Request ended with ${failure.kind} error: ${failure.issue}`;
    } else {
      return `Request ended with error: ${failure.originalError.toString()}`;
    }
  }
}

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
