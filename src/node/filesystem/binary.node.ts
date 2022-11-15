import type { ReadStream } from 'fs';
import { createReadStream, readSync } from 'fs';
import type { FileHandle } from 'fs/promises';
import { open } from 'fs/promises';

import type {
  IBinaryData,
  IBuffered,
  IChunked,
  IDestructible,
  IEncodable,
  IInitializable,
  IStreamable,
  IStreamed,
} from '../../interfaces';
import { UnexpectedError } from '../../lib';
import { handleNodeError } from './filesystem.node';

const BUFFER_ENCODINGS = [
  'ascii',
  'utf8',
  'utf-8',
  'utf16le',
  'ucs2',
  'ucs-2',
  'base64',
  'base64url',
  'latin1',
  'binary',
  'hex',
];

class ChunkedFile implements IChunked {
  constructor(private binaryFile: BinaryFile, private offset: number) {}

  public async getChunk(): Promise<string> {
    return this.binaryFile.getNextChunk(this.offset);
  }
}

class StreamedFile implements IStreamed {
  constructor(private binaryFile: BinaryFile) {}

  public stream(): ReadStream {
    return this.binaryFile.getStream();
  }
}

export class BinaryFile
  implements
    IBinaryData,
    IDestructible,
    IInitializable,
    IEncodable,
    IBuffered,
    IStreamable
{
  private handle: FileHandle | undefined;
  private chunkSize: number | undefined;
  private position = 0;
  private fileSize = Infinity;
  private encoding: BufferEncoding | undefined;

  constructor(public filename: string) {}

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

  public chunkBy(chunkSize: number): Iterable<IChunked> {
    if (this.handle === undefined) {
      throw new UnexpectedError('File is not initialized');
    }
    if (
      chunkSize === undefined ||
      chunkSize === null ||
      typeof chunkSize !== 'number' ||
      chunkSize <= 0 ||
      isNaN(chunkSize)
    ) {
      throw new UnexpectedError('Invalid chunk size');
    }

    if (this.chunkSize === undefined) {
      this.chunkSize = chunkSize;
    }

    return {
      [Symbol.iterator]: () => ({
        next: () => {
          if (this.position >= this.fileSize) {
            return { done: true, value: undefined };
          }

          const value = new ChunkedFile(this, this.position);
          this.position += chunkSize;

          return { done: false, value };
        },
      }),
    };
  }

  public async getNextChunk(offset: number): Promise<string> {
    if (this.handle === undefined) {
      throw new UnexpectedError('File is not open');
    }

    if (this.chunkSize === undefined) {
      throw new UnexpectedError('Chunk size is not set');
    }

    const buffer = Buffer.alloc(this.chunkSize);
    const { bytesRead } = await this.handle.read(
      buffer,
      0,
      this.chunkSize,
      offset
    );

    return buffer.toString(this.encoding, 0, bytesRead);
  }

  public async getAllData(): Promise<Buffer | string> {
    if (this.handle === undefined) {
      throw new UnexpectedError('File is not open');
    }

    const buffer = Buffer.alloc(this.fileSize);
    const { bytesRead } = await this.handle.read(buffer, 0, this.fileSize, 0);

    const slice = buffer.subarray(0, bytesRead);

    if (this.encoding !== undefined) {
      return slice.toString(this.encoding);
    }

    return slice;
  }

  public peek(size: number, offset = 0): string {
    if (this.handle === undefined) {
      throw new UnexpectedError('File is not open');
    }

    const buffer = Buffer.alloc(size);

    const read = readSync(this.handle.fd, buffer, 0, size, offset);

    return buffer.toString(this.encoding, 0, read);
  }

  public encode(encoding: BufferEncoding): this {
    // We need to check if the encoding is valid because this is called in Jessie
    if (!BUFFER_ENCODINGS.includes(encoding.toLowerCase())) {
      throw new UnexpectedError('Invalid encoding');
    }

    this.encoding = encoding;

    return this;
  }

  public toStream(): IStreamed {
    if (this.handle === undefined) {
      throw new UnexpectedError('File is not open');
    }

    return new StreamedFile(this);
  }

  public getStream(): ReadStream {
    if (this.handle === undefined) {
      throw new UnexpectedError('File is not open');
    }

    const options =
      this.encoding !== undefined ? { encoding: this.encoding } : {};

    // We need to create a stream the old fashioned way for Node < 16.11.0
    if (typeof this.handle.createReadStream !== 'function') {
      const stream = createReadStream(this.filename);

      return stream;
    }

    return this.handle.createReadStream(options);
  }
}
