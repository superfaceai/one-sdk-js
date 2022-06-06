import { ErrorBase } from '../internal/errors';

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
  constructor(public override kind: string, public issue: FetchErrorIssue) {
    super(kind, `Fetch failed: ${issue} issue`);
  }
}

export class NetworkFetchError extends FetchError {
  constructor(public override issue: NetworkError['issue']) {
    super('NetworkError', issue);
  }

  public get normalized(): NetworkError {
    return { kind: 'network', issue: this.issue };
  }
}

export class RequestFetchError extends FetchError {
  constructor(public override issue: RequestError['issue']) {
    super('RequestError', issue);
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
