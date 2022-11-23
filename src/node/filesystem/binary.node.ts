import { createReadStream } from 'fs';
import type { FileHandle } from 'fs/promises';
import { open } from 'fs/promises';
import type { Readable } from 'stream';

import type {
  IBinaryData,
  IDestructible,
  IInitializable} from '../../interfaces';
import {
  isDestructible,
  isInitializable,
} from '../../interfaces';
import { UnexpectedError } from '../../lib';
import { handleNodeError } from './filesystem.node';


export interface IDataContainer {
  read(size?: number): Promise<Buffer | undefined>;
  toStream(): Readable;
}

class StreamReader {
  private buffer: Buffer;
  private ended = false;

  private pendingReadResolve: (() => void) | undefined

  constructor(public stream: Readable) {
    this.buffer = Buffer.from([]);

    this.stream.on('data', this.onData.bind(this));
    this.stream.on('end', this.onEnd.bind(this));
  }

  private onData(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    this.notifyData();
  }

  private onEnd() {
    this.ended = true;
    this.notifyData();
  }

  // assumption: this function is never called twice without awaiting its promise in between
  private async waitForData(): Promise<void> {

    this.stream.resume()

    return new Promise((resolve, reject) => {
      if (this.pendingReadResolve !== undefined) {
        reject(new UnexpectedError('Waiting for data failed. Unable to resolve pending read'));
      }
      this.pendingReadResolve = resolve;
    })
  }

  private notifyData() {

    if (this.pendingReadResolve !== undefined) {
      this.pendingReadResolve();
    }

    this.stream.pause();
    this.pendingReadResolve = undefined;
  }

  public async read(size = 1): Promise<Buffer | undefined> {
    while (this.buffer.length < size) {

      if (this.ended) {
        if (this.buffer.length > 0) {
          // yield remaining data
          break;
        } else {
          // signal EOF
          return undefined;
        }
      }

      await this.waitForData();
    }

    const chunk = this.buffer.subarray(0, size); // this might need to be a copy
    this.buffer = this.buffer.subarray(size);

    return chunk;
  }
}

class File implements IDataContainer, IInitializable, IDestructible {
  private handle: FileHandle | undefined;
  private streamReader: StreamReader | undefined;
  public fileSize = Infinity;

  constructor(public filename: string) {}

  public async read(size?: number): Promise<Buffer | undefined> {
    if (!this.streamReader) {
      throw new UnexpectedError('File not initialized');
    }

    return await this.streamReader.read(size);
  }

  public async initialize(): Promise<void> {
    if (this.handle === undefined) {
      try {
        this.handle = await open(this.filename, 'r');
        const { size } = await this.handle.stat();
        this.fileSize = size;
      } catch (error) {
        throw handleNodeError(error);
      }
    }

    if (this.handle === undefined) {
      throw new UnexpectedError('Unable to initialize file');
    }

    let stream: Readable;
    // We need to create a stream the old fashioned way for Node < 16.11.0
    if (typeof this.handle.createReadStream !== 'function') {
      stream = createReadStream(this.filename);
    } else {
      stream = this.handle.createReadStream();
    }

    this.streamReader = new StreamReader(stream);
  }

  public async destroy(): Promise<void> {
    if (this.handle !== undefined) {
      try {
        await this.handle.close();
      } catch (_) {
        // Ignore
      }
    }
  }

  public toStream(): Readable {
    if (this.streamReader === undefined) {
      throw new UnexpectedError('File not initialized');
    }

    return this.streamReader.stream;
  }
}

class Stream implements IDataContainer {
  private streamReader: StreamReader;

  constructor(stream: Readable) {
    this.streamReader = new StreamReader(stream);
  }

  public read(size?: number): Promise<Buffer | undefined> {
    return this.streamReader?.read(size);
  }

  public toStream(): Readable {
    return this.streamReader.stream;
  }
}

export class BinaryData
  implements
    IBinaryData,
    IDestructible,
    IInitializable
{
  private buffer: Buffer;
   
  public static fromPath(filename: string): BinaryData {
    return new BinaryData(new File(filename));
  }

  public static fromStream(stream: Readable): BinaryData {
    return new BinaryData(new Stream(stream));
  }

  private constructor(private dataContainer: IDataContainer) {
    this.buffer = Buffer.from([]);
  }

  public async initialize(): Promise<void> {
    if (isInitializable(this.dataContainer)) {
      await this.dataContainer.initialize();
    }
  }

  public async destroy(): Promise<void> {
    if (isDestructible(this.dataContainer)) {
      await this.dataContainer.destroy();
    }

    this.buffer = Buffer.from([]);
  }

  private async fillBuffer(sizeAtLeast: number): Promise<void> {
    if (this.buffer.length < sizeAtLeast) {
      const read = await this.dataContainer.read(sizeAtLeast - this.buffer.length);
      if (read !== undefined) {
        this.buffer = Buffer.concat([this.buffer, read]);
      }
    }
  }

  private consumeBuffer(size?: number): Buffer {
    let data: Buffer;

    if (size === undefined) {
      data = this.buffer;
      this.buffer = Buffer.from([]);
    } else {
      data = this.buffer.subarray(0, size);
      this.buffer = this.buffer.subarray(size);
    }

    return data;
  }

  public chunkBy(chunkSize: number): AsyncIterable<Buffer> {
    if (
      chunkSize === undefined ||
      chunkSize === null ||
      typeof chunkSize !== 'number' ||
      chunkSize <= 0 ||
      isNaN(chunkSize)
    ) {
      throw new UnexpectedError('Invalid chunk size');
    }

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    return {
      [Symbol.asyncIterator]: () => ({
        async next() {          
          await self.fillBuffer(chunkSize);
          const data = self.consumeBuffer(chunkSize);

          if (!data.length) {
            return { done: true, value: undefined };
          }

          return { done: false, value: data };
        },
      }),
    };
  }

  public async getAllData(): Promise<Buffer> {
    let size = this.buffer.length;

    while (this.buffer.length >= size) {
      size += 1000; // TODO constant
      await this.fillBuffer(size);
    }

    return this.consumeBuffer();
  }

  public async peek(size = 1): Promise<Buffer> {
    await this.fillBuffer(size);

    return this.buffer.subarray(0, size);
  }

  public toStream(): Readable {
    return this.dataContainer.toStream();
  }
}
