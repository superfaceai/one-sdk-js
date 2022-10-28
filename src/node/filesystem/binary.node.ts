import { readSync } from 'fs';
import type { FileHandle } from 'fs/promises';
import { open } from 'fs/promises';

import type {
  IBinaryData,
  IBuffered,
  IChunked,
  IEncodable,
  IInitializable,
} from '../../interfaces';
import { UnexpectedError } from '../../lib';

export class ChunkedFile implements IChunked {
  constructor(private binaryFile: BinaryFile) {}

  public async getChunk(): Promise<string> {
    return this.binaryFile.getNextChunk();
  }
}

export class BinaryFile
  implements IBinaryData, IInitializable, IEncodable, IBuffered
{
  private handle: FileHandle | undefined;
  private chunkSize: number | undefined;
  private position = 0;
  private fileSize = Infinity;
  private encoding: BufferEncoding | undefined;

  constructor(public filename: string) {}

  public async initialize(): Promise<void> {
    if (this.handle === undefined) {
      this.handle = await open(this.filename, 'r');
      const { size } = await this.handle.stat();
      this.fileSize = size;
    }
  }

  public chunkBy(chunkSize: number): Iterable<IChunked> {
    if (this.chunkSize === undefined) {
      this.chunkSize = chunkSize;
    }

    return {
      [Symbol.iterator]: () => ({
        next: () => {
          if (this.position >= this.fileSize) {
            return { done: true, value: undefined };
          }

          const value = new ChunkedFile(this);

          return { done: false, value };
        },
      }),
    };
  }

  public async getNextChunk(): Promise<string> {
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
      undefined
    );

    this.position += bytesRead;

    return buffer.toString(this.encoding, 0, bytesRead);
  }

  public async getAllData(): Promise<Buffer | string> {
    if (this.handle === undefined) {
      throw new UnexpectedError('File is not open');
    }

    const buffer = Buffer.alloc(this.fileSize);
    const { bytesRead } = await this.handle.read(
      buffer,
      0,
      this.fileSize,
      undefined
    );

    const slice = buffer.subarray(0, bytesRead);

    if (this.encoding !== undefined) {
      return slice.toString(this.encoding);
    }

    return slice;
  }

  public peek(size: number): string {
    if (this.handle === undefined) {
      throw new UnexpectedError('File is not open');
    }

    const buffer = Buffer.alloc(size);

    const read = readSync(this.handle.fd, buffer, 0, size, 0);

    return buffer.toString(this.encoding, 0, read);
  }

  public encode(encoding: BufferEncoding): this {
    this.encoding = encoding;

    return this;
  }
}
