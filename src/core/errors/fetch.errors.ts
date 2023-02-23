import { ErrorBase } from './errors';

type NetworkErrorIssue = 'unsigned-ssl' | 'dns' | 'timeout' | 'reject';
type RequestErrorIssue = 'abort' | 'timeout';
type FetchErrorIssue = NetworkErrorIssue | RequestErrorIssue;

export abstract class FetchError extends ErrorBase {
  constructor(kind: string, public issue: FetchErrorIssue) {
    super(kind, `Fetch failed: ${issue} issue`);
  }
}

export class NetworkFetchError extends FetchError {
  constructor(public override issue: NetworkErrorIssue) {
    super(NetworkFetchError.name, issue);
  }
}

export class RequestFetchError extends FetchError {
  constructor(public override issue: RequestErrorIssue) {
    super(RequestFetchError.name, issue);
  }
}

export function isFetchError(input: unknown): input is FetchError {
  return input instanceof FetchError;
}
