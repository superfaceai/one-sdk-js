import type { SecurityValues } from '@superfaceai/ast';

import type { NonPrimitive, Result, UnexpectedError, Variables } from '../lib';
import type { PerformError } from './errors';
import type { IProvider } from './provider';

export type PerformOptions = {
  provider?: IProvider | string;
  parameters?: Record<string, string>;
  security?: SecurityValues[] | { [id: string]: Omit<SecurityValues, 'id'> };
  mapVariant?: string;
  mapRevision?: string;
};

export interface IUseCase {
  perform<
    TInput extends NonPrimitive | undefined = Record<
      string,
      Variables | undefined
    >,
    TOutput = unknown
  >(
    input?: TInput,
    options?: PerformOptions
  ): Promise<Result<TOutput, PerformError | UnexpectedError>>;
}

export interface IChunked {
  getChunk(): Promise<string>;
}

export interface IBinaryData {
  chunkBy(offset: number): Iterable<IChunked>;
  peek(size: number): string;
}

export interface IInitializable {
  initialize(): Promise<void>;
}

export interface IEncodable {
  encode(encoding: string): this;
}

export interface IBuffered {
  getAllData(): Promise<Buffer | string>;
}

export function isChunked(input: unknown): input is IChunked {
  return typeof input === 'object' && input !== null && 'getChunk' in input;
}

export function isBinaryData(input: unknown): input is IBinaryData {
  return typeof input === 'object' && input !== null && 'chunkBy' in input;
}

export function isInitializable(input: unknown): input is IInitializable {
  return typeof input === 'object' && input !== null && 'initialize' in input;
}

export function isEncodable(input: unknown): input is IEncodable {
  return typeof input === 'object' && input !== null && 'encode' in input;
}

export function isBuffered(input: unknown): input is IBuffered {
  return typeof input === 'object' && input !== null && 'getAllData' in input;
}
