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
  private readSize: number;
  private index: number;

  constructor(max = 10, readSize = 1, options?: ReadableOptions) {
    super(options);
    this.max = max;
    this.readSize = readSize;
    this.index = 0;
  }

  public override _read() {
    let i = this.index;
    this.index += this.readSize;

    let str = '';

    while (i < this.index) {
      str += String(i);
      i += 1;
    }

    if (str.length !== 0) {
      this.push(Buffer.from(str));
    }

    if (i >= this.max) {
      this.push(null);
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
      expect(read.toString('utf8')).toBe('0');
    });

    it('reads at least 5', async () => {
      const read = await reader.read(5);
      expect(read.toString('utf8')).toBe('01234');
    });

    it('reads all data if read size is more than stream size', async () => {
      const read = await reader.read(100);
      expect(read.toString('utf8')).toBe('0123456789');
    });

    it('pauses stream after readding byte', async () => {
      const pauseSpy = jest.spyOn(stream, 'pause');
  
      await reader.read();
      expect(pauseSpy).toHaveBeenCalledTimes(1)  
    });

    describe('toStream', () => {
      // add own hook to read all data
      let hooked: string[];
      const testHook = (x?: Buffer) => { 
        if (x !== undefined) hooked.push(x.toString('utf8'));
      };

      beforeEach(() => {
        hooked = [];
        stream.on('data', testHook);
        stream.on('end', testHook);
      });

      it('clears StreamReader hooks from stream', async () => {
        expect(stream.listenerCount('data')).toBe(2);
        expect(stream.listenerCount('end')).toBe(2);

        reader.toStream();

        expect(stream.listenerCount('data')).toBe(2); // testHook + passThrough
        expect(stream.listenerCount('end')).toBe(2);
      });

      it('reads first byte using read and rest from stream', async () => {
        // Read one byte using stream reders
        const read = await reader.read(1);

        const newStream = reader.toStream();

        // read remaining data directly from stream
        const chunks = [read];
        for await (const chunk of newStream) {
          if (Buffer.isBuffer(chunk)) {
            chunks.push(chunk);
          } else {
            chunks.push(chunk);
          }
        }

        expect(Buffer.concat(chunks).toString('utf8')).toBe('0123456789');
      });

      it('pushes read data to returned stream', async () => {
        stream = new MockStream(10, 5);
        reader = new StreamReader(stream);

        const read = await reader.read(4); // leaves one byte in buffer

        const newStream = reader.toStream();

        const chunks = [read];
        for await (const chunk of newStream) {
          chunks.push(chunk);
        }

        expect(Buffer.concat(chunks).toString('utf8')).toBe('0123456789');
      });

      it('consumes all stream and still provides buffer data through returned stream', async () => {
        stream = new MockStream(10, 10);
        reader = new StreamReader(stream);

        const read = await reader.read(9); // leaves one byte in buffer
        const newStream = reader.toStream();

        const chunks = [read];
        for await (const chunk of newStream) {
          chunks.push(chunk);
        }

        expect(Buffer.concat(chunks).toString('utf8')).toBe('0123456789');
      });

      it('throws error when calling toStream() twice', () => {
        reader.toStream();

        let error: unknown;
        try {
          reader.toStream();
        } catch (err: unknown) {
          error = err;
        }

        expect(error).toBeInstanceOf(UnexpectedError);
      });
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
      expect(fileContainer.size).toBeGreaterThan(0);
    });

    it('throws an error if the file does not exist', async () => {
      const fileContainer = new FileContainer('non-existent.txt');
      await expect(fileContainer.initialize()).rejects.toThrow(NotFoundError);
    });

    it('sets name from file if not passed as option', () => {
      const fileContainer = new FileContainer(fixturePath);
      expect(fileContainer.name).toBe('binary.txt');
    });

    it('closes handle and resets data container', async () => {
      const closeHandleSpy = jest.spyOn((fileContainer as any).handle, 'close');

      await fileContainer.destroy();

      expect(closeHandleSpy).toHaveBeenCalled();
      expect(fileContainer.size).toBe(Infinity);
      expect((fileContainer as any).handle).toBe(undefined);
      expect((fileContainer as any).stream).toBe(undefined);
      expect((fileContainer as any).streamReader).toBe(undefined);
    });

    it('sets filesize', async () => {
      expect(fileContainer.size).not.toBe(Infinity);
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

      it('throws an error if trying to read a file that is not initialized', async () => {
        binaryData = BinaryData.fromPath(fixturePath);
        await expect(binaryData.read(10)).rejects.toBeInstanceOf(UnexpectedError);
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

      describe('peek 10', () => {
        it('peeks data correctly', async () => {
          const peekedData = await binaryData.peek(10);
          expect(peekedData.toString('utf8')).toEqual(originalData.subarray(0, 10).toString());
        });
      });

      describe('read 10', () => {
        it('reads data correctly', async () => {
          const readData = await binaryData.read(10);
          expect(readData.toString('utf8')).toEqual(originalData.subarray(0, 10).toString());
        });
      });

      describe('get all data', () => {
        it('gets all data correctly', async () => {
          const allData = (await binaryData.getAllData()).toString('utf8');
          expect(allData).toEqual(originalData.toString());
        });
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

      describe('stream', () => {
        it('should stream data correctly', async () => {
          const stream = binaryData.toStream();
          expect(stream).toBeInstanceOf(Readable);

          let readData = '';
          for await (const chunk of stream) {
            readData += chunk.toString('utf8');
          }

          expect(readData).toBe(originalData.toString('utf8'));
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
          expect(peekedData.toString('utf8')).toEqual(originalData.subarray(0, 10).toString());

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
          expect(peekedData.toString('utf8')).toEqual(originalData.subarray(10, 20).toString());
        });
      });

      describe('peek 10 and read 10', () => {
        it('reads same data as peek', async() => {
          const peekedData = await binaryData.peek(10);
          const readData = await binaryData.read(10);

          expect(readData).toEqual(peekedData);
        });
      });

      describe('read 10 and read stream', () => {
        it('reads remaining data from stream', async () => {
          const readTenData = await binaryData.read(10);

          let readData = '';
          for await (const chunk of binaryData.toStream()) {
            readData += chunk.toString('utf8');
          }

          expect(readTenData.toString('utf8') + readData).toBe(originalData.toString('utf8'));
        });
      });

      describe('peek 10 and read stream', () => {
        it('reads all data from stream', async () => {
          const peekedData = await binaryData.peek(10);

          let readData = '';
          for await (const chunk of binaryData.toStream()) {
            readData += chunk.toString('utf8');
          }

          expect(peekedData.toString('utf8')).toBe(originalData.subarray(0, 10).toString('utf8'));
          expect(readData).toBe(originalData.toString('utf8'));
        });
      });
    });
  });
});
