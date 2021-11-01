import { getLocal } from 'mockttp';
import { mocked } from 'ts-jest/utils';

import { NetworkFetchError, RequestFetchError } from './fetch.errors';

const mockServer = getLocal();

type ForEachCallbackFunction = (value?: string, type?: string) => void;

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
      const { CrossFetch } = await import('./fetch');

      await mockServer.get('/test').thenTimeout();
      const fetch = new CrossFetch();

      await expect(
        fetch.fetch(`${mockServer.url}/test`, { method: 'GET', timeout: 2000 })
      ).rejects.toEqual(new NetworkFetchError('timeout'));
    }, 10000);

    it('rejects on rejected connection', async () => {
      const { CrossFetch } = await import('./fetch');

      await mockServer.get('/test').thenCloseConnection();
      const fetch = new CrossFetch();

      await expect(
        fetch.fetch(`${mockServer.url}/test`, { method: 'GET', timeout: 2000 })
      ).rejects.toEqual(new NetworkFetchError('reject'));
    }, 10000);

    it('rethrows error if it is string', async () => {
      const { CrossFetch } = await import('./fetch');

      //We are mocking node-fetch
      const { fetch } = await import('cross-fetch');
      jest.mock('cross-fetch');
      mocked(fetch).mockRejectedValue('something-bad');

      const fetchInstance = new CrossFetch();

      await expect(
        fetchInstance.fetch(`${mockServer.url}/test`, {
          method: 'GET',
          timeout: 2000,
        })
      ).rejects.toEqual('something-bad');
    }, 10000);

    it('rethrows error if it does not contain type property', async () => {
      const { CrossFetch } = await import('./fetch');

      //We are mocking node-fetch
      const { fetch } = await import('cross-fetch');
      jest.mock('cross-fetch');
      mocked(fetch).mockRejectedValue({ some: 'something-bad' });

      const fetchInstance = new CrossFetch();

      await expect(
        fetchInstance.fetch(`${mockServer.url}/test`, {
          method: 'GET',
          timeout: 2000,
        })
      ).rejects.toEqual({ some: 'something-bad' });
    }, 10000);

    it('throws request abort if error does not get recognized', async () => {
      const { CrossFetch } = await import('./fetch');

      //We are mocking node-fetch
      const { fetch } = await import('cross-fetch');
      jest.mock('cross-fetch');
      mocked(fetch).mockRejectedValue({ type: 'something-bad' });

      const fetchInstance = new CrossFetch();

      await expect(
        fetchInstance.fetch(`${mockServer.url}/test`, {
          method: 'GET',
          timeout: 2000,
        })
      ).rejects.toEqual(new RequestFetchError('abort'));
    }, 10000);

    it('throws on dns ENOTFOUND', async () => {
      const { CrossFetch } = await import('./fetch');

      //We are mocking node-fetch
      const { fetch } = await import('cross-fetch');
      jest.mock('cross-fetch');
      mocked(fetch).mockRejectedValue({
        type: 'system',
        code: 'ENOTFOUND',
        errno: '',
      });

      const fetchInstance = new CrossFetch();

      await expect(
        fetchInstance.fetch(`${mockServer.url}/test`, {
          method: 'GET',
          timeout: 2000,
        })
      ).rejects.toEqual(new NetworkFetchError('dns'));
    }, 10000);

    it('throws on dns EAI_AGAIN', async () => {
      const { CrossFetch } = await import('./fetch');

      //We are mocking node-fetch
      const { fetch } = await import('cross-fetch');
      jest.mock('cross-fetch');
      mocked(fetch).mockRejectedValue({
        type: 'system',
        code: 'EAI_AGAIN',
        errno: '',
      });

      const fetchInstance = new CrossFetch();

      await expect(
        fetchInstance.fetch(`${mockServer.url}/test`, {
          method: 'GET',
          timeout: 2000,
        })
      ).rejects.toEqual(new NetworkFetchError('dns'));
    }, 10000);
  });

  describe('when application/json content type received', () => {
    let responseJsonMock: jest.Mock;
    let result: any;

    beforeEach(async () => {
      const { fetch } = await import('cross-fetch');

      jest.mock('cross-fetch');

      responseJsonMock = jest.fn().mockResolvedValue({
        foo: 'bar',
      });

      mocked(fetch).mockResolvedValue({
        headers: {
          forEach: jest.fn((callbackfn: ForEachCallbackFunction) => {
            callbackfn('application/json', 'content-type');
          }),
        },
        json: responseJsonMock,
      } as any);

      const { CrossFetch } = await import('./fetch');

      const fetchInstance = new CrossFetch();

      result = await fetchInstance.fetch(`${mockServer.url}/test`, {
        method: 'GET',
      });
    });

    it('should call json', async () => {
      expect(responseJsonMock).toBeCalled();
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
      const { fetch } = await import('cross-fetch');

      jest.mock('cross-fetch');

      responseTextMock = jest.fn().mockResolvedValue('foobar');

      mocked(fetch).mockResolvedValue({
        headers: {
          forEach: jest.fn((callbackfn: ForEachCallbackFunction) => {
            callbackfn('text/plain', 'content-type');
          }),
        },
        text: responseTextMock,
      } as any);

      const { CrossFetch } = await import('./fetch');

      const fetchInstance = new CrossFetch();

      result = await fetchInstance.fetch(`${mockServer.url}/test`, {
        method: 'GET',
      });
    });

    it('should call text', async () => {
      expect(responseTextMock).toBeCalled();
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
          const { fetch } = await import('cross-fetch');

          jest.mock('cross-fetch');

          responseArrayBufferMock = jest
            .fn()
            .mockResolvedValue(Buffer.from('foobar'));

          mocked(fetch).mockResolvedValue({
            headers: {
              forEach: jest.fn((callbackfn: ForEachCallbackFunction) => {
                callbackfn(contentType, 'content-type');
              }),
            },
            arrayBuffer: responseArrayBufferMock,
          } as any);

          const { CrossFetch } = await import('./fetch');

          const fetchInstance = new CrossFetch();

          result = await fetchInstance.fetch(`${mockServer.url}/test`, {
            method: 'GET',
          });
        });

        it('should call arrayBuffer', async () => {
          expect(responseArrayBufferMock).toBeCalled();
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
      const { fetch } = await import('cross-fetch');

      jest.mock('cross-fetch');

      responseArrayBufferMock = jest
        .fn()
        .mockResolvedValue(Buffer.from('foobar'));

      mocked(fetch).mockResolvedValue({
        headers: {
          forEach: jest.fn((callbackfn: ForEachCallbackFunction) => {
            callbackfn(undefined, undefined);
          }),
        },
        arrayBuffer: responseArrayBufferMock,
      } as any);
    });

    describe('when accept header contains string value', () => {
      let result: any;

      beforeEach(async () => {
        const { CrossFetch } = await import('./fetch');

        const fetchInstance = new CrossFetch();

        result = await fetchInstance.fetch(`${mockServer.url}/test`, {
          method: 'GET',
          headers: {
            accept: 'application/octet-stream',
          },
        });
      });

      it('should call arrayBuffer', async () => {
        expect(responseArrayBufferMock).toBeCalled();
      });

      it('should return instance of Buffer in body', async () => {
        expect(result.body).toBeInstanceOf(Buffer);
      });
    });

    describe('when accept header contains array of string values', () => {
      let result: any;

      beforeEach(async () => {
        const { CrossFetch } = await import('./fetch');

        const fetchInstance = new CrossFetch();

        result = await fetchInstance.fetch(`${mockServer.url}/test`, {
          method: 'GET',
          headers: {
            accept: ['application/octet-stream'],
          },
        });
      });

      it('should call arrayBuffer', async () => {
        expect(responseArrayBufferMock).toBeCalled();
      });

      it('should return instance of Buffer in body', async () => {
        expect(result.body).toBeInstanceOf(Buffer);
      });
    });
  });

  describe('when request body contains binary data', () => {
    it('should call cross-fetch with Buffer in body', async () => {
      const { fetch } = await import('cross-fetch');
      jest.mock('cross-fetch');

      const { CrossFetch } = await import('./fetch');

      mocked(fetch).mockResolvedValue({
        headers: {
          forEach: jest.fn((callbackfn: ForEachCallbackFunction) => {
            callbackfn(undefined, undefined);
          }),
        },
        text: jest.fn(),
      } as any);

      const fetchInstance = new CrossFetch();

      await fetchInstance.fetch(`${mockServer.url}/test`, {
        method: 'POST',
        body: { _type: 'binary', data: Buffer.from('data') },
      });

      expect((fetch as jest.Mock).mock.calls[0][1].body).toBeInstanceOf(Buffer);
    });
  });
});
