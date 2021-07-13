import { getLocal } from 'mockttp';
import { mocked } from 'ts-jest/utils';
import { NetworkFetchError, RequestFetchError } from './fetch.errors';

const mockServer = getLocal();

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
});
