import FormData from 'form-data';
import { getLocal } from 'mockttp';
import type { Response } from 'node-fetch';
import fetch, { Headers } from 'node-fetch';

import { NetworkFetchError, RequestFetchError } from '../../core';
import { MockTimers } from '../../mock';
import { NodeTimers } from '../timers';
import { NodeFetch } from './fetch.node';

jest.mock('node-fetch', () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = jest.requireActual<typeof import('node-fetch')>('node-fetch');

  return {
    __esModule: true,
    ...actual,
    default: jest.fn(),
  };
});

const mockServer = getLocal();
const timers = new MockTimers();

describe('NodeFetch', () => {
  describe('fetch', () => {
    beforeEach(async () => {
      await mockServer.start();
    });

    afterEach(async () => {
      await mockServer.stop();
      jest.resetAllMocks();
      jest.resetModules();
    });

    describe('timeout', () => {
      it('timeouts on network timeout', async () => {
        // we want to use actual fetch implementation
        jest
          .mocked(fetch)
          .mockImplementation(jest.requireActual('node-fetch').default);

        await mockServer.forGet('/test').thenTimeout();
        const realTimers = new NodeTimers();
        const nodeFetch = new NodeFetch(realTimers);

        await expect(
          nodeFetch.fetch(`${mockServer.url}/test`, {
            method: 'GET',
            timeout: 2000,
          })
        ).rejects.toEqual(new NetworkFetchError('timeout'));
      });

      it('rejects on rejected connection', async () => {
        // we want to use actual fetch implementation
        jest
          .mocked(fetch)
          .mockImplementation(jest.requireActual('node-fetch').default);

        await mockServer.forGet('/test').thenCloseConnection();
        const nodeFetch = new NodeFetch(timers);

        await expect(
          nodeFetch.fetch(`${mockServer.url}/test`, {
            method: 'GET',
            timeout: 2000,
          })
        ).rejects.toEqual(new NetworkFetchError('reject'));
      });

      it('rethrows error if it is string', async () => {
        jest.mocked(fetch).mockRejectedValue('something-bad');

        const fetchInstance = new NodeFetch(timers);

        await expect(
          fetchInstance.fetch(`${mockServer.url}/test`, {
            method: 'GET',
            timeout: 2000,
          })
        ).rejects.toEqual('something-bad');
      });

      it('rethrows error if it does not contain type property', async () => {
        // We are mocking node-fetch
        jest.mocked(fetch).mockRejectedValue({ some: 'something-bad' });

        const fetchInstance = new NodeFetch(timers);

        await expect(
          fetchInstance.fetch(`${mockServer.url}/test`, {
            method: 'GET',
            timeout: 2000,
          })
        ).rejects.toEqual({ some: 'something-bad' });
      });

      it('throws fetch abort if error does not get recognized', async () => {
        jest.mocked(fetch).mockRejectedValue({ type: 'something-bad' });

        const fetchInstance = new NodeFetch(timers);

        await expect(
          fetchInstance.fetch(`${mockServer.url}/test`, {
            method: 'GET',
            timeout: 2000,
          })
        ).rejects.toEqual(new RequestFetchError('abort'));
      });

      it('throws on dns ENOTFOUND', async () => {
        jest.mocked(fetch).mockRejectedValue({
          type: 'system',
          code: 'ENOTFOUND',
          errno: '',
        });

        const fetchInstance = new NodeFetch(timers);

        await expect(
          fetchInstance.fetch(`${mockServer.url}/test`, {
            method: 'GET',
            timeout: 2000,
          })
        ).rejects.toEqual(new NetworkFetchError('dns'));
      });

      it('throws on dns EAI_AGAIN', async () => {
        jest.mocked(fetch).mockRejectedValue({
          type: 'system',
          code: 'EAI_AGAIN',
          errno: '',
        });

        const fetchInstance = new NodeFetch(timers);

        await expect(
          fetchInstance.fetch(`${mockServer.url}/test`, {
            method: 'GET',
            timeout: 2000,
          })
        ).rejects.toEqual(new NetworkFetchError('dns'));
      });
    });

    describe('when application/json content type received', () => {
      let responseJsonMock: jest.Mock;
      let result: any;

      beforeEach(async () => {
        responseJsonMock = jest.fn().mockResolvedValue({
          foo: 'bar',
        });

        jest.mocked(fetch).mockResolvedValue({
          headers: new Headers([['content-type', 'application/json']]),
          json: responseJsonMock,
        } as any);

        const fetchInstance = new NodeFetch(timers);

        result = await fetchInstance.fetch(`${mockServer.url}/test`, {
          method: 'GET',
        });
      });

      it('should call json', async () => {
        expect(responseJsonMock).toHaveBeenCalled();
      });

      it('should return json object in body', async () => {
        expect(result.body).toBeInstanceOf(Object);
        expect(result.body).toStrictEqual({
          foo: 'bar',
        });
      });
    });

    describe('when text/plain content type received', () => {
      let responseTextMock: jest.Mock;
      let result: any;

      beforeEach(async () => {
        responseTextMock = jest.fn().mockResolvedValue('foobar');

        jest.mocked(fetch).mockResolvedValue({
          headers: new Headers([['content-type', 'text/plain']]),
          text: responseTextMock,
        } as any);

        const fetchInstance = new NodeFetch(timers);

        result = await fetchInstance.fetch(`${mockServer.url}/test`, {
          method: 'GET',
        });
      });

      it('should call text', async () => {
        expect(responseTextMock).toHaveBeenCalled();
      });

      it('should return plain text in body', async () => {
        expect(result.body).toBe('foobar');
      });
    });

    describe('when binary content type received', () => {
      const binaryContentTypes = [
        'application/octet-stream',
        'audio/mp3',
        'audio/wav',
        'audio/wav;rate=8000',
        'video/mp4',
        'image/jpeg',
      ];

      for (const contentType of binaryContentTypes) {
        describe(`${contentType}`, () => {
          let responseArrayBufferMock: jest.Mock;
          let result: any;

          beforeEach(async () => {
            responseArrayBufferMock = jest
              .fn()
              .mockResolvedValue(Buffer.from('foobar'));

            jest.mocked(fetch).mockResolvedValue({
              headers: new Headers([['content-type', contentType]]),
              arrayBuffer: responseArrayBufferMock,
            } as any);

            const fetchInstance = new NodeFetch(timers);

            result = await fetchInstance.fetch(`${mockServer.url}/test`, {
              method: 'GET',
            });
          });

          it('should call arrayBuffer', async () => {
            expect(responseArrayBufferMock).toHaveBeenCalled();
          });

          it('should return instance of Buffer in body', async () => {
            expect(result.body).toBeInstanceOf(Buffer);
          });
        });
      }
    });

    describe('when application/octet-stream content type accepted', () => {
      let responseArrayBufferMock: jest.Mock;

      beforeEach(async () => {
        responseArrayBufferMock = jest
          .fn()
          .mockResolvedValue(Buffer.from('foobar'));

        jest.mocked(fetch).mockResolvedValue({
          headers: new Headers(),
          arrayBuffer: responseArrayBufferMock,
        } as any);
      });

      describe('when accept header contains string value', () => {
        let result: any;

        beforeEach(async () => {
          const fetchInstance = new NodeFetch(timers);

          result = await fetchInstance.fetch(`${mockServer.url}/test`, {
            method: 'GET',
            headers: {
              accept: 'application/octet-stream',
            },
          });
        });

        it('should call arrayBuffer', async () => {
          expect(responseArrayBufferMock).toHaveBeenCalled();
        });

        it('should return instance of Buffer in body', async () => {
          expect(result.body).toBeInstanceOf(Buffer);
        });
      });

      describe('when accept header contains array of string values', () => {
        let result: any;

        beforeEach(async () => {
          const fetchInstance = new NodeFetch(timers);

          result = await fetchInstance.fetch(`${mockServer.url}/test`, {
            method: 'GET',
            headers: {
              accept: ['application/octet-stream'],
            },
          });
        });

        it('should call arrayBuffer', async () => {
          expect(responseArrayBufferMock).toHaveBeenCalled();
        });

        it('should return instance of Buffer in body', async () => {
          expect(result.body).toBeInstanceOf(Buffer);
        });
      });
    });

    describe('when request body contains binary data', () => {
      it('should call fetch with Buffer in body', async () => {
        jest.mocked(fetch).mockResolvedValue({
          headers: new Headers(),
          text: jest.fn(),
        } as any);

        const fetchInstance = new NodeFetch(timers);

        await fetchInstance.fetch(`${mockServer.url}/test`, {
          method: 'POST',
          body: { _type: 'binary', data: Buffer.from('data') },
        });

        expect(jest.mocked(fetch).mock.calls[0][1]!.body).toBeInstanceOf(
          Buffer
        );
      });
    });

    describe('when request body is multipart/form-data', () => {
      let fetchInstance: NodeFetch;

      beforeEach(() => {
        fetchInstance = new NodeFetch(timers);

        jest.mocked(fetch).mockResolvedValue({
          headers: new Headers(),
          text: jest.fn(),
        } as any);
      });

      describe('field value is a Buffer', () => {
        it('passes FormData instance as body', async () => {
          await fetchInstance.fetch(`${mockServer.url}/test`, {
            method: 'POST',
            body: {
              _type: 'formdata',
              data: { bufferField: Buffer.from('data') },
            },
          });

          expect(jest.mocked(fetch).mock.calls[0][1]?.body).toBeInstanceOf(
            FormData
          );
        });
      });

      describe('field value is an Array', () => {
        it('expands array to duplicate fields in FormData', async () => {
          await fetchInstance.fetch(`${mockServer.url}/test`, {
            method: 'POST',
            body: { _type: 'formdata', data: { arrayField: [1, 2] } },
          });

          // form-data library doesn't have getAll, so need to get buffer,
          // create string and regex for number of entries
          expect(
            (jest.mocked(fetch).mock.calls[0][1]?.body as unknown as FormData)
              .getBuffer()
              .toString()
              .match(/arrayField/g)?.length
          ).toBe(2);
        });
      });
    });

    // this test works under the assumption that node-fetch returns multi-valued headers as arrays
    // this is not true for node-fetch 2.x
    // eslint-disable-next-line jest/no-disabled-tests
    it.skip('should correctly send and receive multi-valued headers', async () => {
      jest.mocked(fetch).mockImplementation(
        async (url, options) => {
          expect(url).toStrictEqual('http://test.local');

          const requestHeaders = options?.headers as Headers;
          expect(requestHeaders.raw()).toMatchObject({ first: ['abc'], second: ['ab', 'bc'] });

          const headers = new Headers();
          headers.append('foo', 'string');
          headers.append('bar', 'a');
          headers.append('bar', 'b');
          headers.append('bar', 'c');

          return {
            headers: headers,
            text: jest.fn()
          } as unknown as Response;
        }
      );

      const fetchInstance = new NodeFetch(timers);
      const result = await fetchInstance.fetch('http://test.local', {
        method: 'GET',
        headers: {
          first: 'abc',
          second: ['ab', 'bc']
        }
      });

      expect(result.headers).toStrictEqual({
        foo: 'string',
        bar: ['a', 'b', 'c']
      });
    });
  });
});
