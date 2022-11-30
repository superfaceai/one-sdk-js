import type { Readable } from 'stream';

export interface IDataContainer {
  read(size?: number): Promise<Buffer | undefined>;
  toStream(): Readable;
}

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

export interface IBinaryFileMeta {
  readonly filename: string | undefined;
  readonly mimetype: string | undefined;
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

export function isBinaryFileMeta(input: unknown): input is IBinaryFileMeta {
  return typeof input === 'object' && input !== null && 'filename' in input && 'mimetype' in input;
}
