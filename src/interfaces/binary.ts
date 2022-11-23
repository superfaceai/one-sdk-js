import type { Readable } from 'stream';

export interface IBinaryData {
  peek(size?: number): Promise<Buffer | undefined>;
  getAllData(): Promise<Buffer>;
  chunkBy(chunkSize: number): AsyncIterable<Buffer>;
  toStream(): Readable;
}

export interface IInitializable {
  initialize(): Promise<void>;
}

export interface IDestructible {
  destroy(): Promise<void>;
}

export function isBinaryData(input: unknown): input is IBinaryData {
  return typeof input === 'object' && input !== null
    && 'peek' in input
    && 'getAllData' in input
    && 'chunkBy' in input
    && 'toStream' in input;
}

export function isInitializable(input: unknown): input is IInitializable {
  return typeof input === 'object' && input !== null && 'initialize' in input;
}

export function isDestructible(input: unknown): input is IDestructible {
  return typeof input === 'object' && input !== null && 'destroy' in input;
}
