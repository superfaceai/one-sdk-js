import { ErrorBase } from '../internal/errors';

interface NetworkError {
  kind: 'network';
  issue: 'unsigned-ssl' | 'dns' | 'timeout' | 'reject';
}

interface RequestError {
  kind: 'request';
  issue: 'abort' | 'timeout';
}

export class FetchError extends ErrorBase {
  constructor(
    public override kind: string,
    public issue: NetworkError['issue'] | RequestError['issue']
  ) {
    super(kind, `Fetch failed because of ${issue} issue`);
  }
}

export class NetworkFetchError extends FetchError {
  constructor(public override issue: NetworkError['issue']) {
    super('NetworkError', issue);
  }

  get normalized(): NetworkError {
    return { kind: 'network', issue: this.issue };
  }
}

export class RequestFetchError extends FetchError {
  constructor(public override issue: RequestError['issue']) {
    super('RequestError', issue);
  }

  get normalized(): RequestError {
    return { kind: 'request', issue: this.issue };
  }
}

export type CrossFetchError = NetworkFetchError | RequestFetchError;
