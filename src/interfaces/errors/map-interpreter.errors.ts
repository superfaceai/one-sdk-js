import type { MapASTNode, MapDocumentNode } from '@superfaceai/ast';

import type { HttpMultiMap } from '../../core/interpreter/http';

export interface ErrorMetadata {
  node?: MapASTNode;
  ast?: MapDocumentNode;
}

export interface IMapASTError extends Error {
  name: 'MapASTError';
  metadata?: ErrorMetadata;
}

export interface IMappedError<T> extends Error {
  name: 'MappedError';
  metadata?: ErrorMetadata;
  properties?: T;
}

export interface IJessieError extends Error {
  name: 'JessieError';
  metadata?: ErrorMetadata;
}

export interface IHTTPError extends Error {
  name: 'HTTPError';
  metadata?: ErrorMetadata;
  statusCode?: number;
  request?: {
    body?: unknown;
    headers?: HttpMultiMap;
    url?: string;
  };
  response?: {
    body?: unknown;
    headers?: HttpMultiMap;
  };
}

export interface IMappedHTTPError<T> extends Error {
  name: 'MappedHTTPError';
  metadata?: ErrorMetadata;
  statusCode?: number;
  properties?: T;
}

export type MapInterpreterError =
  | IMapASTError
  | IMappedHTTPError<unknown>
  | IMappedError<unknown>
  | IHTTPError
  | IJessieError;

export const isMapInterpreterError = (e: unknown): e is MapInterpreterError => {
  return typeof e === 'object'
    && e !== null
    && 'name' in e
    && [
      'MapASTError',
      'MappedHTTPError',
      'MappedError',
      'HTTPError',
      'JessieError'
    ].includes((e as { name: string }).name);
}
