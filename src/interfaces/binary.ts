export interface IDataContainer {
  read(size?: number): Promise<Uint8Array>;
  toStream(): NodeJS.ReadableStream; // FIXME: This should be ECMAScript ReadableStream
}

export interface IBinaryData {
  peek(size?: number): Promise<Uint8Array>;
  read(size?: number): Promise<Uint8Array>;
  getAllData(): Promise<Uint8Array>;
  chunkBy(chunkSize: number): AsyncIterable<Uint8Array>;
  toStream(): NodeJS.ReadableStream;
}

export interface IInitializable {
  initialize(): Promise<void>;
}

export interface IDestructible {
  destroy(): Promise<void>;
}

export interface IBinaryDataMeta {
  readonly name: string | undefined;
  readonly mimetype: string | undefined;
  readonly size: number | undefined;
}

export function isBinaryData(input: unknown): input is IBinaryData {
  return (
    typeof input === 'object' &&
    input !== null &&
    'peek' in input &&
    'getAllData' in input &&
    'chunkBy' in input &&
    'toStream' in input
  );
}

export function isInitializable(input: unknown): input is IInitializable {
  return typeof input === 'object' && input !== null && 'initialize' in input;
}

export function isDestructible(input: unknown): input is IDestructible {
  return typeof input === 'object' && input !== null && 'destroy' in input;
}

export function isBinaryDataMeta(input: unknown): input is IBinaryDataMeta {
  return (
    typeof input === 'object' &&
    input !== null &&
    'name' in input &&
    'mimetype' in input
  );
}
