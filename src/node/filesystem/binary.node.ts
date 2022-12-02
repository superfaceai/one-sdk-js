import { createReadStream } from 'fs';
import type { FileHandle } from 'fs/promises';
import { open } from 'fs/promises';
import type { ReadableOptions } from 'stream';
import { Readable } from 'stream';

import type {
  IBinaryData,
  IBinaryFileMeta,
  IDataContainer,
  IDestructible,
  IInitializable} from '../../interfaces';
import {
  isBinaryFileMeta,
  isDestructible,
  isInitializable,
} from '../../interfaces';
import { UnexpectedError } from '../../lib';
import { handleNodeError } from './filesystem.node';

class StreamReader {
  private stream: Readable;
  private buffer: Buffer;
  private ended = false;

  private pendingReadResolve: (() => void) | undefined

  constructor(stream: Readable) {
    this.buffer = Buffer.from([]);

    this.stream = new ReadableClone(stream);
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
    this.stream.resume();

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

class ReadableClone extends Readable {
  constructor(private stream: Readable, options?: ReadableOptions) {
    super(options);

    this.stream.on('data', (chunk) => {
      this.push(chunk);
    });

    this.stream.on('end', () => {
      this.push(null);
    });

    this.stream.on('error', (error) => {
      this.emit('error', error);
    })
  }

  public override _read(): void {}
}

class File implements IDataContainer, IBinaryFileMeta, IInitializable, IDestructible {
  private handle: FileHandle | undefined;
  public stream: Readable | undefined;
  private streamReader: StreamReader | undefined;
  public filesize = Infinity;
  public filename: string | undefined;
  public mimetype: string | undefined;

  constructor(public path: string, options: { filename?: string, mimetype?: string } = {}) {
    this.mimetype = options.mimetype;
    this.filename = options.filename;
  }

  public async read(size?: number): Promise<Buffer | undefined> {
    if (!this.streamReader) {
      throw new UnexpectedError('File not initialized');
    }

    return await this.streamReader.read(size);
  }

  public async initialize(): Promise<void> {
    if (this.handle === undefined) {
      try {
        this.handle = await open(this.path, 'r');
        const { size } = await this.handle.stat();
        this.filesize = size;
      } catch (error) {
        throw handleNodeError(error);
      }
    }

    if (this.handle === undefined) {
      throw new UnexpectedError('Unable to initialize file');
    }

    // We need to create a stream the old fashioned way for Node < 16.11.0
    if (typeof this.handle.createReadStream !== 'function') {
      this.stream = createReadStream(this.path);
    } else {
      this.stream = this.handle.createReadStream();
    }

    this.streamReader = new StreamReader(this.stream);
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
    if (this.stream === undefined) {
      throw new UnexpectedError('File not initialized');
    }

    return this.stream;
  }
}

class Stream implements IDataContainer {
  private streamReader: StreamReader;

  constructor(private stream: Readable) {
    this.streamReader = new StreamReader(stream);
  }

  public read(size?: number): Promise<Buffer | undefined> {
    return this.streamReader?.read(size);
  }

  public toStream(): Readable {
    return this.stream;
  }
}

export class BinaryData
  implements
    IBinaryData,
    IBinaryFileMeta,
    IDestructible,
    IInitializable
{
  private buffer: Buffer;
   
  public static fromPath(filename: string, options: { filename?: string, mimetype?: string } = {}): BinaryData {
    return new BinaryData(new File(filename, options));
  }

  public static fromStream(stream: Readable): BinaryData {
    return new BinaryData(new Stream(stream));
  }

  private constructor(private dataContainer: IDataContainer) {
    this.buffer = Buffer.from([]);
  }

  public get filename(): string | undefined {
    if (isBinaryFileMeta(this.dataContainer)) {
      return this.dataContainer.filename;
    }

    return undefined;
  }

  public get mimetype(): string | undefined {
    if (isBinaryFileMeta(this.dataContainer)) {
      return this.dataContainer.mimetype;
    }

    return undefined;
  }

  public get filesize(): number | undefined {
    if (isBinaryFileMeta(this.dataContainer)) {
      return this.dataContainer.filesize;
    }

    return undefined;
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
    /*
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    return new Readable({
      async read(size) {
        console.log('reading', { size });

        return await self.dataContainer.read(size);
      },
    });
    */
  }
}
