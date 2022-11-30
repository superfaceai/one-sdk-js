import { readFile } from 'fs/promises';
import { join as joinPath } from 'path';
import { Readable } from 'stream';

import { NotFoundError } from '../../core';
import { UnexpectedError } from '../../lib';
import { BinaryData } from './binary.node';

const path = joinPath('fixtures', 'binary.txt');

describe('BinaryData class', () => {
  describe('fromPath', () => {
    it('opens file correctly', async () => {
      const data = BinaryData.fromPath(path);
      await data.initialize();
      expect(data).toBeDefined();
      await data.destroy();
    });

    it('throws an error if the file does not exist', async () => {
      const data = BinaryData.fromPath('non-existent-file');
      await expect(data.initialize()).rejects.toThrow(NotFoundError);
    });  
  });

  describe('fromStream', () => {
    // TODO
  });

  describe('operations on BinaryData', () => {
    let binaryData: BinaryData;
    let originalData: Buffer;

    beforeAll(async () => {
      originalData = await readFile(path);
    });

    beforeEach(async () => {
      binaryData = BinaryData.fromPath(path);
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
        const differentBinaryFile = BinaryData.fromPath(path);
        await expect(differentBinaryFile.getAllData()).rejects.toBeInstanceOf(UnexpectedError);
      });
    });

    describe('peek 10', () => {
       it('peeks data correctly', async () => {
         const peekedData = await binaryData.peek(10);
         expect(peekedData?.toString('utf8')).toEqual(originalData.subarray(0, 10).toString());
       });

       it('throws an error if trying to peek a file that is not initialized', async () => {
         const differentBinaryFile = BinaryData.fromPath(path);
         await expect(differentBinaryFile.peek(10)).rejects.toBeInstanceOf(UnexpectedError);
       });
     });

    describe('stream', () => {
      it('should stream data correctly', async () => {
        const stream = binaryData.toStream();
        expect(stream).toBeInstanceOf(Readable);
      });

      it('should throw an error if trying to stream a file that is not initialized', async () => {
        const differentBinaryFile = BinaryData.fromPath(path);
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
