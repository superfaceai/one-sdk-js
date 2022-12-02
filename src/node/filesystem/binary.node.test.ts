import { readFile } from 'fs/promises';
import { join as joinPath } from 'path';
import type { ReadableOptions } from 'stream';
import { Readable } from 'stream';

import { NotFoundError } from '../../core';
import { UnexpectedError } from '../../lib';
import { BinaryData, FileContainer, StreamContainer, StreamReader } from './binary.node';

const fixturePath = joinPath('fixtures', 'binary.txt');

class MockStream extends Readable {
  private max: number;
  private index: number;

  constructor(max = 10, options?: ReadableOptions) {
    super(options);
    this.max = max;
    this.index = 1;
  }

  public override _read() {
    const i = this.index++;
    if (i > this.max)
      this.push(null);
    else {
      const str = String(i);
      const buf = Buffer.from(str);
      this.push(buf);
    }
  }
}

describe('Node Binary', () => {
  describe('StreamReader class', () => {
    let stream: Readable;
    let reader: StreamReader;

    beforeEach(() => {
      stream = new MockStream(10);
      reader = new StreamReader(stream);
    });

    it('reads one byte as default', async () => {
      const read = await reader.read();
      expect(read).toStrictEqual(Buffer.from('1'));
    });

    it('reads at least 5', async () => {
      const read = await reader.read(5);
      expect(read).toStrictEqual(Buffer.from('12345'));
    });

    it('reads all data if read size is more than stream size', async () => {
      const read = await reader.read(100);
      expect(read).toStrictEqual(Buffer.from('12345678910'));
    });

    it('pauses stream after readding byte', async () => {
      const pauseSpy = jest.spyOn(stream, 'pause');
  
      await reader.read();
      expect(pauseSpy).toHaveBeenCalledTimes(1)  
    });

    it('clears hooks from stream', async () => {
      // add own hook to read all data
      const hooked: string[] = [];
      const testHook = (x?: Buffer) => { 
        if (x !== undefined) hooked.push(x.toString('utf8'));
      };

      stream.on('data', testHook);
      stream.on('end', testHook);

      expect(stream.listenerCount('data')).toBe(2);
      expect(stream.listenerCount('end')).toBe(2);

      // Read one byte using stream reders
      await reader.read(1);
      expect(hooked.join('')).toBe('1');

      // Eject stream from reader
      reader.ejectStream();
      expect(stream.listenerCount('data')).toBe(1);
      expect(stream.listenerCount('end')).toBe(1);

      // read remaining data directly from stream
      const chunks = [];
      for await (const chunk of stream) {
        if (Buffer.isBuffer(chunk)) {
          chunks.push(chunk.toString('utf8'));
        } else {
          chunks.push(chunk);
        }
      }

      // all data from own hook
      expect(hooked.join('')).toBe('12345678910');
      // read directly from stream
      expect(chunks.join('')).toBe('2345678910');
    });
  });

  describe('FileContainer class', () => {
    let fileContainer: FileContainer;

    beforeEach(async () => {
      fileContainer = new FileContainer(fixturePath, { filename: 'testfile.txt', mimetype: 'text/plain' });
      await fileContainer.initialize();
    });

    afterEach(async () => {
      await fileContainer.destroy();
    });

    it('opens file correctly', async () => {
      expect(fileContainer.filesize).toBeGreaterThan(0);
    });

    it('throws an error if the file does not exist', async () => {
      const fileContainer = new FileContainer('non-existent.txt');
      await expect(fileContainer.initialize()).rejects.toThrow(NotFoundError);
    });

    it('closes handle and resets data container', async () => {
      const closeHandleSpy = jest.spyOn((fileContainer as any).handle, 'close');

      await fileContainer.destroy();

      expect(closeHandleSpy).toHaveBeenCalled();
      expect(fileContainer.filesize).toBe(Infinity);
      expect((fileContainer as any).handle).toBe(undefined);
      expect((fileContainer as any).stream).toBe(undefined);
      expect((fileContainer as any).streamReader).toBe(undefined);
    });

    it('sets filesize', async () => {
      expect(fileContainer.filesize).not.toBe(Infinity);
    });
  });

  describe('StreamContainer class', () => {
    let streamContainer: StreamContainer;

    beforeEach(async () => {
      streamContainer = new StreamContainer(new MockStream());
    });

    describe('toStream', () => {
      it('returns readable', () => {
        expect(streamContainer.toStream()).toBeInstanceOf(Readable);
      });
    });
  });

  describe('BinaryData class', () => {
    let binaryData: BinaryData;

    describe('fromPath', () => {      
      it('returns BinaryData instance', () => {
        binaryData = BinaryData.fromPath(fixturePath);
        expect(binaryData).toBeInstanceOf(BinaryData);
      });
    });

    describe('fromStream', () => {
      it('returns BinaryData instance', () => {
        binaryData = BinaryData.fromStream(new MockStream());
        expect(binaryData).toBeInstanceOf(BinaryData);
      });
    });

    describe('operations on BinaryData', () => {
      let originalData: Buffer;

      beforeAll(async () => {
        originalData = await readFile(fixturePath);
      });

      beforeEach(async () => {
        binaryData = BinaryData.fromPath(fixturePath);
        await binaryData.initialize();
      });

      afterEach(async () => {
        await binaryData.destroy();
      });

      describe('chunk by 10', () => {
        it('chunks file correctly', async () => {
          let offset = 0;
          for await (const chunkData of binaryData.chunkBy(10)) {
            expect(chunkData.toString('utf8')).toEqual(
              originalData.subarray(offset, offset + 10).toString()
            );
            offset += 10;
          }

          expect(offset).not.toBe(0);
        });

        it('throws an error if trying to chunk a file with invalid chunk size', async () => {
          expect(() => binaryData.chunkBy(0)).toThrow();
          expect(() => binaryData.chunkBy(-1)).toThrow();
          expect(() => binaryData.chunkBy(undefined as any)).toThrow();
          expect(() => binaryData.chunkBy(null as any)).toThrow();
          expect(() => binaryData.chunkBy(NaN as any)).toThrow();
          expect(() => binaryData.chunkBy('a banana?!' as any)).toThrow();
          expect(() => binaryData.chunkBy({} as any)).toThrow();
          expect(() => binaryData.chunkBy([] as any)).toThrow();
          expect(() => binaryData.chunkBy((() => {}) as any)).toThrow();
          expect(() => binaryData.chunkBy(true as any)).toThrow();
          expect(() =>
            binaryData.chunkBy(Buffer.from('hello world!') as any)
          ).toThrow();
        });
      });

      describe('get all data', () => {
        it('gets all data correctly', async () => {
          const allData = (await binaryData.getAllData()).toString('utf8');
          expect(allData).toEqual(originalData.toString());
        });

        it('throws an error if trying to get all data from a file that is not initialized', async () => {
          const differentBinaryFile = BinaryData.fromPath(fixturePath);
          await expect(differentBinaryFile.getAllData()).rejects.toBeInstanceOf(UnexpectedError);
        });
      });

      describe('peek 10', () => {
        it('peeks data correctly', async () => {
          const peekedData = await binaryData.peek(10);
          expect(peekedData?.toString('utf8')).toEqual(originalData.subarray(0, 10).toString());
        });

        it('throws an error if trying to peek a file that is not initialized', async () => {
          const differentBinaryFile = BinaryData.fromPath(fixturePath);
          await expect(differentBinaryFile.peek(10)).rejects.toBeInstanceOf(UnexpectedError);
        });
      });

      describe('stream', () => {
        it('should stream data correctly', async () => {
          const stream = binaryData.toStream();
          expect(stream).toBeInstanceOf(Readable);
        });

        it('should throw an error if trying to stream a file that is not initialized', async () => {
          const differentBinaryFile = BinaryData.fromPath(fixturePath);
          expect(() => differentBinaryFile.toStream()).toThrow();
        });
      });

      describe('peek 10 then getAllData', () => {
        it('gets all data correctly', async () => {
          const peekedData = await binaryData.peek(10);
          expect(peekedData?.toString('utf8')).toBe(originalData.subarray(0, 10).toString());

          const data = await binaryData.getAllData();
          expect(data.toString('utf8')).toBe(originalData.toString('utf8'));
        });
      });

      describe('getAllData then peek 10', () => {
        it('returns undefined', async () => {
          const data = await binaryData.getAllData();
          expect(data.toString('utf8')).toBe(originalData.toString('utf8'));

          const peekedData = await binaryData.peek(10);
          expect(peekedData).toEqual(Buffer.from([]));
        });
      });

      describe('peek 10 then chunkBy 10', () => {
        it('chunks data correctly', async () => {
          const peekedData = await binaryData.peek(10);
          expect(peekedData?.toString('utf8')).toEqual(originalData.subarray(0, 10).toString());

          for await (const chunk of binaryData.chunkBy(10)) {
            expect(chunk.toString('utf8')).toBe(originalData.subarray(0, 10).toString('utf8'));
            break;
          }
        });
      });

      describe('chunkBy 10 then peek 10', () => {
        it('chunks data correctly', async () => {
          for await (const chunk of binaryData.chunkBy(10)) {
            expect(chunk.toString('utf8')).toBe(originalData.subarray(0, 10).toString('utf8'));
            break;
          }

          const peekedData = await binaryData.peek(10);
          expect(peekedData?.toString('utf8')).toEqual(originalData.subarray(10, 20).toString());
        });
      });
    });
  });
});
