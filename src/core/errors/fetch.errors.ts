import { ErrorBase } from '../../lib';

interface NetworkError {
  kind: 'network';
  issue: 'unsigned-ssl' | 'dns' | 'timeout' | 'reject';
}

interface RequestError {
  kind: 'request';
  issue: 'abort' | 'timeout';
}

export type FetchErrorIssue = NetworkError['issue'] | RequestError['issue'];

export class FetchErrorBase extends ErrorBase {
  constructor(kind: string, public issue: FetchErrorIssue) {
    super(kind, `Fetch failed: ${issue} issue`);
    Object.setPrototypeOf(this, FetchErrorBase.prototype);
  }
}

export class NetworkFetchError extends FetchErrorBase {
  constructor(public override issue: NetworkError['issue']) {
    super('NetworkError', issue);
    Object.setPrototypeOf(this, NetworkFetchError.prototype);
  }

  public get normalized(): NetworkError {
    return { kind: 'network', issue: this.issue };
  }
}

export class RequestFetchError extends FetchErrorBase {
  constructor(public override issue: RequestError['issue']) {
    super('RequestError', issue);
    Object.setPrototypeOf(this, RequestFetchError.prototype);
  }

  public get normalized(): RequestError {
    return { kind: 'request', issue: this.issue };
  }
}

export type FetchError = NetworkFetchError | RequestFetchError;

export function isFetchError(input: unknown): input is FetchError {
  return (
    typeof input === 'object' &&
    (input instanceof NetworkFetchError || input instanceof RequestFetchError)
  );
}
