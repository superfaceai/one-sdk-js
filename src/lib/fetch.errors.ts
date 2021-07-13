import { ErrorBase } from '../internal/errors';

export interface NetworkError {
  kind: 'network';
  issue: 'unsigned-ssl' | 'dns' | 'timeout' | 'reject';
}

export interface RequestError {
  kind: 'request';
  issue: 'abort' | 'timeout';
}

export class NetworkFetchError extends ErrorBase {
  constructor(public issue: NetworkError['issue']) {
    super('NetworkError', `Fetch failed because of ${issue} issue`);
  }
}

export class RequestFetchError extends ErrorBase {
  constructor(public issue: RequestError['issue']) {
    super('RequestError', `Fetch failed because of ${issue} issue`);
  }
}

export type CrossFetchError = NetworkFetchError | RequestFetchError;
