import * as fs from 'fs';
import { dirname, join as joinPath } from 'path';

import { SuperJson } from '../../internal/superjson';
import { SuperfaceClient } from '../public/client';
import * as profileProvider from '../query/profile-provider';
import { ProfileConfiguration } from './profile';
import { ProviderConfiguration } from './provider';

jest.mock('fs', () => ({
  statSync: jest.fn(),
  readFileSync: jest.fn(),
  promises: {
    access: jest.fn(),
  },
}));

describe('superface client', () => {
  const MOCK_SUPERJSON_PATH = SuperJson.defaultPath();
  const MOCK_SUPERJSON = {
    profiles: {
      'testy/mctestface': '0.1.0',
      foo: 'file://../foo.supr',
      baz: {
        version: '1.2.3',
        providers: {
          quz: {},
        },
      },
    },
    providers: {
      fooder: {
        file: '../fooder.provider.json',
        security: [],
      },
      quz: {},
    },
  };

  const statSyncMock = fs.statSync as jest.Mock;
  const readFileSyncMock = fs.readFileSync as jest.Mock;
  const accessMock = fs.promises.access as jest.Mock;
  beforeAll(() => {
    statSyncMock.mockImplementation((path: string) => {
      if (path === MOCK_SUPERJSON_PATH) {
        return {
          isFile: () => path === MOCK_SUPERJSON_PATH,
        };
      } else {
        throw { code: 'ENOENT' };
      }
    });
    readFileSyncMock.mockImplementation((path: string) => {
      if (path === MOCK_SUPERJSON_PATH) {
        return JSON.stringify(MOCK_SUPERJSON);
      } else {
        throw { code: 'ENOENT' };
      }
    });
    accessMock.mockImplementation(async (path: string) => {
      if (path === MOCK_SUPERJSON_PATH) {
        return undefined;
      } else {
        throw { code: 'ENOENT' };
      }
    });
  });

  it('caches super.json files correctly', () => {
    const mockCalls = [
      statSyncMock.mock.calls.length,
      readFileSyncMock.mock.calls.length,
    ];

    const client = new SuperfaceClient();
    expect(client.superJson.document).toEqual(MOCK_SUPERJSON);
    expect(statSyncMock.mock.calls.length).toBe(mockCalls[0] + 1);
    expect(readFileSyncMock.mock.calls.length).toBe(mockCalls[1] + 1);

    const clientCached = new SuperfaceClient();
    expect(clientCached.superJson.document).toEqual(MOCK_SUPERJSON);
    // no more calls than before
    expect(statSyncMock.mock.calls.length).toBe(mockCalls[0] + 1);
    expect(readFileSyncMock.mock.calls.length).toBe(mockCalls[1] + 1);
  });

  describe('getProfile', () => {
    it('rejects when profile does not exists', async () => {
      const client = new SuperfaceClient();

      await expect(client.getProfile('does/not-exist')).rejects.toThrow(
        'Profile "does/not-exist" is not installed. Please install it by running `superface install does/not-exist`.'
      );
    });

    it('rejects when profile points to a non-exitent path', async () => {
      const client = new SuperfaceClient();

      await expect(client.getProfile('foo')).rejects.toThrow(
        'File "../foo.supr" specified in super.json does not exist.'
      );
    });

    it('returns a valid profile when it points to existing path', async () => {
      const client = new SuperfaceClient();

      accessMock.mockImplementationOnce(async (path: string) => {
        const expectedPath = joinPath(
          dirname(SuperJson.defaultPath()),
          MOCK_SUPERJSON.profiles.foo.slice('file://'.length)
        );
        if (path === expectedPath) {
          return undefined;
        } else {
          throw { code: 'ENOENT' };
        }
      });
      const profile = await client.getProfile('foo');
      expect(profile.configuration.version).toBe('unknown');
    });

    it('returns a valid profile when it points to existing path - known version', async () => {
      const client = new SuperfaceClient();

      const profile = await client.getProfile('baz');
      expect(profile.configuration.version).toBe('1.2.3');
    });

    it('caches bound profile providers', async () => {
      const client = new SuperfaceClient();

      const profileConfigA = new ProfileConfiguration('foo', '1.0.0');
      const profileConfigB = new ProfileConfiguration('foo', '2.0.0');
      const providerConfig = new ProviderConfiguration('fooder', []);

      const profileProviderBindMock = jest.fn(() => 'mocked bind result');
      const ProfileProviderMock = jest
        .spyOn(profileProvider, 'ProfileProvider')
        .mockReturnValue({
          bind: profileProviderBindMock,
        } as any);

      await expect(
        client.cacheBoundProfileProvider(profileConfigA, providerConfig)
      ).resolves.toBe('mocked bind result');
      expect(ProfileProviderMock).toHaveBeenCalledTimes(1);
      expect(profileProviderBindMock).toHaveBeenCalledTimes(1);

      await expect(
        client.cacheBoundProfileProvider(profileConfigB, providerConfig)
      ).resolves.toBe('mocked bind result');
      expect(ProfileProviderMock).toHaveBeenCalledTimes(2);
      expect(profileProviderBindMock).toHaveBeenCalledTimes(2);

      await expect(
        client.cacheBoundProfileProvider(profileConfigA, providerConfig)
      ).resolves.toBe('mocked bind result');
      expect(ProfileProviderMock).toHaveBeenCalledTimes(2);
      expect(profileProviderBindMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('getProviderForProfile', () => {
    it('throws when on providers are not configured', async () => {
      const client = new SuperfaceClient();

      await expect(client.getProviderForProfile('foo')).rejects.toThrow(
        'No configured provider found for profile foo.'
      );
    });

    it('returns a configured provider when present', async () => {
      const client = new SuperfaceClient();

      const provider = await client.getProviderForProfile('baz');
      expect(provider.configuration.name).toBe('quz');
    });
  });

  describe('profiles getter', () => {
    it('throws when on profiles are not implemented', () => {
      const client = new SuperfaceClient();

      expect(() => client.profiles).toThrow('TODO');
    });
  });

  describe('providers getter', () => {
    it('throws when on providers are not implemented', () => {
      const client = new SuperfaceClient();

      expect(() => client.providers).toThrow('TODO');
    });
  });
});
