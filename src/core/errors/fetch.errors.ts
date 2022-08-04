import { ErrorBase } from './errors';

interface NetworkError {
  kind: 'network';
  issue: 'unsigned-ssl' | 'dns' | 'timeout' | 'reject';
}

interface RequestError {
  kind: 'request';
  issue: 'abort' | 'timeout';
}

export type FetchErrorIssue = NetworkError['issue'] | RequestError['issue'];

export class FetchError extends ErrorBase {
  constructor(kind: string, public issue: FetchErrorIssue) {
    super(kind, `Fetch failed: ${issue} issue`);
    Object.setPrototypeOf(this, FetchError.prototype);
  }
}

export class NetworkFetchError extends FetchError {
  constructor(public override issue: NetworkError['issue']) {
    super('NetworkError', issue);
    Object.setPrototypeOf(this, NetworkFetchError.prototype);
  }

  public get normalized(): NetworkError {
    return { kind: 'network', issue: this.issue };
  }
}

export class RequestFetchError extends FetchError {
  constructor(public override issue: RequestError['issue']) {
    super('RequestError', issue);
    Object.setPrototypeOf(this, RequestFetchError.prototype);
  }

  public get normalized(): RequestError {
    return { kind: 'request', issue: this.issue };
  }
}

export type CrossFetchError = NetworkFetchError | RequestFetchError;

export function isCrossFetchError(input: unknown): input is CrossFetchError {
  return (
    typeof input === 'object' &&
    (input instanceof NetworkFetchError || input instanceof RequestFetchError)
  );
}
