import { ReadStream } from 'fs';
import { readFile } from 'fs/promises';
import { join as joinPath } from 'path';

import { NotFoundError } from '../../core';
import { UnexpectedError } from '../../lib';
import { BinaryFile } from './binary.node';

const path = joinPath('fixtures', 'binary.txt');

describe('BinaryFile class', () => {
  it('should open file correctly', async () => {
    const binaryFile = new BinaryFile(path);
    await binaryFile.initialize();
    expect(binaryFile).toBeDefined();
    await binaryFile.destroy();
  });

  it('should throw an error if the file does not exist', async () => {
    const binaryFile = new BinaryFile('non-existent-file');
    await expect(binaryFile.initialize()).rejects.toThrow(NotFoundError);
  });

  describe('operations on the file', () => {
    let binaryFile: BinaryFile;
    let data: Buffer;

    beforeEach(async () => {
      data = await readFile(path);
      binaryFile = new BinaryFile(path);
      await binaryFile.initialize();
    });

    afterEach(async () => {
      await binaryFile.destroy();
    });

    describe('chunking', () => {
      it('should chunk file correctly', async () => {
        let offset = 0;
        for (const chunk of binaryFile.chunkBy(10)) {
          const chunkData = await chunk.getChunk();
          expect(chunkData).toEqual(
            data.subarray(offset, offset + 10).toString()
          );
          offset += 10;
        }
      });

      it('should throw an error if trying to chunk a file that is not initialized', async () => {
        const differentBinaryFile = new BinaryFile(path);
        expect(() => differentBinaryFile.chunkBy(10)).toThrow();
      });

      it('should throw an error if trying to chunk a file with invalid chunk size', async () => {
        expect(() => binaryFile.chunkBy(0)).toThrow();
        expect(() => binaryFile.chunkBy(-1)).toThrow();
        expect(() => binaryFile.chunkBy(undefined as any)).toThrow();
        expect(() => binaryFile.chunkBy(null as any)).toThrow();
        expect(() => binaryFile.chunkBy(NaN as any)).toThrow();
        expect(() => binaryFile.chunkBy('a banana?!' as any)).toThrow();
        expect(() => binaryFile.chunkBy({} as any)).toThrow();
        expect(() => binaryFile.chunkBy([] as any)).toThrow();
        expect(() => binaryFile.chunkBy((() => {}) as any)).toThrow();
        expect(() => binaryFile.chunkBy(true as any)).toThrow();
        expect(() =>
          binaryFile.chunkBy(Buffer.from('hello world!') as any)
        ).toThrow();
      });
    });

    describe('getting all data', () => {
      it('should get all data correctly', async () => {
        const allData = (await binaryFile.getAllData()).toString();
        expect(allData).toEqual(data.toString());
      });

      // This test is fucked up for no damn reason?!
      it('should throw an error if trying to get all data from a file that is not initialized', async () => {
        const differentBinaryFile = new BinaryFile(path);
        await expect(differentBinaryFile.getAllData()).rejects.toBeInstanceOf(UnexpectedError);
      });
    });

    describe('encoding', () => {
      it('should get data in the correct encoding', async () => {
        {
          const allData = (await binaryFile.getAllData()).toString();
          expect(allData).toEqual(data.toString());
        }
        {
          const allData = await binaryFile.encode('utf8').getAllData();
          expect(allData).toEqual(data.toString('utf8'));
        }
        {
          const allData = await binaryFile.encode('hex').getAllData();
          expect(allData).toEqual(data.toString('hex'));
        }
        {
          const allData = await binaryFile.encode('base64').getAllData();
          expect(allData).toEqual(data.toString('base64'));
        }
      });

      it('should throw an error if trying to get data in an invalid encoding', async () => {
        expect(() => binaryFile.encode('invalid' as any)).toThrow();
      });
    });

    describe('peeking', () => {
      it('should peek data correctly', async () => {
        const peekedData = binaryFile.peek(10);
        expect(peekedData).toEqual(data.subarray(0, 10).toString());
      });

      it('should throw an error if trying to peek a file that is not initialized', async () => {
        const differentBinaryFile = new BinaryFile(path);
        expect(() => differentBinaryFile.peek(10)).toThrow();
      });

      it('should peek from the middle of the file correctly', async () => {
        const peekedData = binaryFile.peek(10, 10);
        expect(peekedData).toEqual(data.subarray(10, 20).toString());
      });

      it('should peek in base64 correctly', async () => {
        const peekedData = binaryFile.encode('base64').peek(10);
        expect(peekedData).toEqual(data.subarray(0, 10).toString('base64'));
      });
    });

    describe('streaming', () => {
      it('should stream data correctly', async () => {
        const stream = binaryFile.toStream().stream();
        expect(stream).toBeInstanceOf(ReadStream);
      });

      it('should throw an error if trying to stream a file that is not initialized', async () => {
        const differentBinaryFile = new BinaryFile(path);
        expect(() => differentBinaryFile.toStream()).toThrow();
      });
    });
  });
});
