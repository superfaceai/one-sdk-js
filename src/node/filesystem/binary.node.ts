import { createReadStream } from 'fs';
import type { FileHandle } from 'fs/promises';
import { open } from 'fs/promises';
import { PassThrough, Readable } from 'stream';

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

export class StreamReader {
  private stream: NodeJS.ReadableStream;
  private buffer: Buffer;
  private ended = false;

  private pendingReadResolve: (() => void) | undefined

  private dataCallback: (chunk: Buffer) => void;
  private endCallback: (this: () => void) => void;

  constructor(stream: NodeJS.ReadableStream) {
    this.buffer = Buffer.alloc(0);
    this.stream = stream;

    this.dataCallback = this.onData.bind(this);
    this.endCallback = this.onEnd.bind(this);

    this.hook();
  }

  private hook() {
    this.stream.on('data', this.dataCallback);
    this.stream.on('end', this.endCallback);
  }

  private unhook() {
    this.stream.off('data', this.dataCallback);
    this.stream.off('end', this.endCallback);
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

  public async read(size = 1): Promise<Buffer> {
    while (this.buffer.length < size) {
      if (this.ended) {
        if (this.buffer.length > 0) {
          // yield remaining data
          break;
        } else {
          // signal EOF
          return Buffer.alloc(0);
        }
      }

      await this.waitForData();
    }

    const chunk = this.buffer.subarray(0, size); // this might need to be a copy
    this.buffer = this.buffer.subarray(size);

    return chunk;
  }

  public toStream(): Readable {
    this.unhook();

    const buffer = this.buffer;
    this.buffer = Buffer.alloc(0);

    const pass = new PassThrough();

    if (buffer.length > 0) {
      pass.push(buffer);
    }
    
    this.stream.pipe(pass);

    return pass;
  }
}

export class FileContainer implements IDataContainer, IBinaryFileMeta, IInitializable, IDestructible {
  private handle: FileHandle | undefined;
  private stream: NodeJS.ReadableStream | undefined;
  private streamReader: StreamReader | undefined;
  public filesize = Infinity;
  public filename: string | undefined;
  public mimetype: string | undefined;

  constructor(public path: string, options: { filename?: string, mimetype?: string } = {}) {
    this.mimetype = options.mimetype;
    this.filename = options.filename;
  }

  public async read(size?: number): Promise<Buffer> {
    if (!this.streamReader) {
      if (!this.stream) {
        throw new UnexpectedError('File not initialized');
      }
      
      throw new UnexpectedError('File being streamed');
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
        this.stream = undefined;
        this.streamReader = undefined;
        this.filesize = Infinity;
        this.handle = undefined;
      } catch (_) {
        // Ignore
      }
    }
  }

  public toStream(): NodeJS.ReadableStream {
    if (this.streamReader === undefined) {
      throw new UnexpectedError('File not initialized');
    }

    return this.streamReader.toStream();
  }
}

export class StreamContainer implements IDataContainer {
  private stream: NodeJS.ReadableStream;
  private streamReader: StreamReader;

  constructor(stream: NodeJS.ReadableStream) {
    this.stream = stream;
    this.streamReader = new StreamReader(this.stream);
  }

  public read(size?: number): Promise<Buffer> {
    return this.streamReader.read(size);
  }

  public toStream(): NodeJS.ReadableStream {
    return this.streamReader.toStream();
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
    return new BinaryData(new FileContainer(filename, options));
  }

  public static fromStream(stream: NodeJS.ReadableStream): BinaryData {
    return new BinaryData(new StreamContainer(stream));
  }

  private constructor(private dataContainer: IDataContainer) {
    this.buffer = Buffer.alloc(0);
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

    this.buffer = Buffer.alloc(0);
  }

  private async fillBuffer(sizeAtLeast: number): Promise<void> {
    if (this.buffer.length < sizeAtLeast) {
      const read = await this.dataContainer.read(sizeAtLeast - this.buffer.length);
      if (read.length > 0) {
        this.buffer = Buffer.concat([this.buffer, read]);
      }
    }
  }

  private consumeBuffer(size?: number): Buffer {
    let data: Buffer;

    if (size === undefined) {
      data = this.buffer;
      this.buffer = Buffer.alloc(0);
    } else {
      data = this.buffer.subarray(0, size);
      this.buffer = this.buffer.subarray(size);
    }

    return data;
  }

  /**
   * Reads data and stores them in internal buffer for later consumption
   * 
   * @param [size=1] Specifies how much data to peek
   * @returns Peeked data as Buffer
   */
  public async peek(size = 1): Promise<Buffer> {
    await this.fillBuffer(size);

    return this.buffer.subarray(0, size);
  }

  /**
   * Reads data
   * @param [size=1] Specifies how much data to read
   * @returns Read data as Buffer
   */
  public async read(size = 1): Promise<Buffer> {
    await this.fillBuffer(size);

    return this.consumeBuffer();
  }

  /**
   * Reads data from stream and returns chunk once filled with requested size
   * 
   * @param chunkSize Specifies how many bytes should be in one chunk, except last which can be smaller
   * @returns Async interable returning one chunk
   */
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

  /**
   * Reads data from Stream until the stream is closed
   * 
   * @param [chunkSize=16000] specifies how much data in bytes to read in one chunk
   * @returns Read data as Buffer
   */
  public async getAllData(chunkSize = 16000): Promise<Buffer> {
    let size = this.buffer.length;

    while (this.buffer.length >= size) {
      size += chunkSize;
      await this.fillBuffer(size);
    }

    return this.consumeBuffer();
  }

  /**
   * Converts BinaryData to Readable stream
   * 
   * @returns Readable instance
   */
  public toStream(): NodeJS.ReadableStream {
    const source = this.dataContainer.toStream();

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    // TODO just unshift buffered data?
    return new Readable({
      async read() {
        // If some data were peeked we push them to stream at the beginning
        if (self.buffer.length > 0) {
          this.push(self.consumeBuffer());
        }

        for await (const chunk of source) {
          if (!this.push(chunk)) {
            return; // All read stop reading
          }
        }

        this.push(null); // Source didn't return any data, but can do so later
      }
    });
  }
}
