import * as fs from 'fs';
import { dirname, join as joinPath } from 'path';

import { Config, DEFAULT_SUPERFACE_PATH } from '../config';
import { SuperfaceClient } from './client';
import { ProfileConfiguration } from './profile';
import * as profileProvider from './profile-provider';
import { ProviderConfiguration } from './provider';

jest.mock('fs', () => ({
  statSync: jest.fn(),
  readFileSync: jest.fn(),
  promises: {
    access: jest.fn(),
  },
  realpathSync: jest.fn(),
}));

afterEach(() => {
  jest.useRealTimers();
});

jest.mock('./failure/event-adapter');

describe('superface client', () => {
  //Mock env path
  const CUSTOM_PATH = 'somepath';

  //Mock super json for default path
  const MOCK_SUPERJSON_PATH = DEFAULT_SUPERFACE_PATH;
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
  const MOCK_SUPERJSON_NO_PROVIDER_PATH = 'some other path';
  const MOCK_SUPERJSON_NO_PROVIDER = {
    profiles: {
      foo: 'file://foo.supr',
    },
  };
  //Mock super json for custom path
  const MOCK_SUPERJSON_CUSTOM_PATH = {
    profiles: {
      test: '2.1.0',
    },
    providers: {
      quz: {},
    },
  };

  const statSyncMock = fs.statSync as jest.Mock;
  const readFileSyncMock = fs.readFileSync as jest.Mock;
  const accessMock = fs.promises.access as jest.Mock;
  beforeEach(() => {
    statSyncMock.mockImplementation((path: string) => {
      if (path === MOCK_SUPERJSON_PATH) {
        return {
          isFile: () => path === MOCK_SUPERJSON_PATH,
        };
      } else if (path === CUSTOM_PATH) {
        return {
          isFile: () => path === CUSTOM_PATH,
        };
      } else if (path === MOCK_SUPERJSON_NO_PROVIDER_PATH) {
        return {
          isFile: () => path === MOCK_SUPERJSON_NO_PROVIDER_PATH,
        };
      } else {
        throw { code: 'ENOENT' };
      }
    });
    readFileSyncMock.mockImplementation((path: string) => {
      if (path === MOCK_SUPERJSON_PATH) {
        return JSON.stringify(MOCK_SUPERJSON);
      } else if (path === CUSTOM_PATH) {
        return JSON.stringify(MOCK_SUPERJSON_CUSTOM_PATH);
      } else if (path === MOCK_SUPERJSON_NO_PROVIDER_PATH) {
        return JSON.stringify(MOCK_SUPERJSON_NO_PROVIDER);
      } else {
        throw { code: 'ENOENT' };
      }
    });
    accessMock.mockImplementation(async (path: string) => {
      if (path === MOCK_SUPERJSON_PATH) {
        return undefined;
      } else if (path === CUSTOM_PATH) {
        return undefined;
      } else {
        throw { code: 'ENOENT' };
      }
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('caches super.json files correctly', () => {
    const client = new SuperfaceClient();
    expect(client.superJson.document).toEqual(MOCK_SUPERJSON);
    const statCalls = statSyncMock.mock.calls.length;
    const readFileCalls = readFileSyncMock.mock.calls.length;

    const clientCached = new SuperfaceClient();
    expect(clientCached.superJson.document).toEqual(MOCK_SUPERJSON);
    // no more calls than before
    expect(statSyncMock).toHaveBeenCalledTimes(statCalls);
    expect(readFileSyncMock).toHaveBeenCalledTimes(readFileCalls);
  });

  it('caches super.json on custom path files correctly', () => {
    const orignalPath = Config.instance().superfacePath;
    Config.instance().superfacePath = CUSTOM_PATH;

    const client = new SuperfaceClient();
    expect(client.superJson.document).toEqual(MOCK_SUPERJSON_CUSTOM_PATH);
    const statCalls = statSyncMock.mock.calls.length;
    const readFileCalls = readFileSyncMock.mock.calls.length;

    const clientCached = new SuperfaceClient();
    expect(clientCached.superJson.document).toEqual(MOCK_SUPERJSON_CUSTOM_PATH);
    // no more calls than before
    expect(statSyncMock).toHaveBeenCalledTimes(statCalls);
    expect(readFileSyncMock).toHaveBeenCalledTimes(readFileCalls);

    Config.instance().superfacePath = orignalPath;
  });

  describe('getProfile', () => {
    it('rejects when profile does not exists', async () => {
      const client = new SuperfaceClient();

      await expect(client.getProfile('does/not-exist')).rejects.toThrow(
        'Hint: Profile can be installed using the superface cli tool: `superface install does/not-exist`'
      );
    });

    it('rejects when profile points to a non-exitent path', async () => {
      const client = new SuperfaceClient();

      await expect(client.getProfile('foo')).rejects.toThrow(
        `Profile "foo" specifies a file path "../foo.supr" in super.json
but this path does not exist or is not accessible`
      );
    });

    it('returns a valid profile when it points to existing path', async () => {
      const client = new SuperfaceClient();

      accessMock.mockImplementationOnce(async (path: string) => {
        const expectedPath = joinPath(
          dirname(DEFAULT_SUPERFACE_PATH),
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

    it('rebinds profile provider when timeout expires', async () => {
      jest.useFakeTimers();
      const client = new SuperfaceClient();

      const profileConfig = new ProfileConfiguration('foo', '1.0.0');
      const providerConfig = new ProviderConfiguration('fooder', []);

      const profileProviderBindMock = jest
        .fn()
        .mockReturnValueOnce('first mocked bind result')
        .mockReturnValueOnce('second mocked bind result');
      const ProfileProviderMock = jest
        .spyOn(profileProvider, 'ProfileProvider')
        .mockReturnValue({
          bind: profileProviderBindMock,
        } as any);

      await expect(
        client.cacheBoundProfileProvider(profileConfig, providerConfig)
      ).resolves.toBe('first mocked bind result');
      expect(ProfileProviderMock).toHaveBeenCalledTimes(1);
      expect(profileProviderBindMock).toHaveBeenCalledTimes(1);

      expect(
        (client as any).boundCache[
          profileConfig.cacheKey + providerConfig.cacheKey
        ]
      ).toEqual({
        profileProvider: 'first mocked bind result',
        expiresAt: expect.any(Number),
      });

      jest.advanceTimersByTime(1000 + 1000 * 60 * 60);

      await expect(
        client.cacheBoundProfileProvider(profileConfig, providerConfig)
      ).resolves.toBe('first mocked bind result');
      expect(ProfileProviderMock).toHaveBeenCalledTimes(2);
      expect(profileProviderBindMock).toHaveBeenCalledTimes(2);

      expect(
        (client as any).boundCache[
          profileConfig.cacheKey + providerConfig.cacheKey
        ]
      ).toEqual({
        profileProvider: 'second mocked bind result',
        expiresAt: expect.any(Number),
      });
    });
  });

  describe('getProviderForProfile', () => {
    it('throws when providers are not configured', async () => {
      const orignalPath = Config.instance().superfacePath;
      Config.instance().superfacePath = CUSTOM_PATH;

      const client = new SuperfaceClient();

      await expect(client.getProviderForProfile('foo')).rejects.toThrow(
        'Profile "foo" needs at least one configured provider for automatic provider selection'
      );
      Config.instance().superfacePath = orignalPath;
    });

    it('returns a configured provider when present', async () => {
      const client = new SuperfaceClient();

      const provider = await client.getProviderForProfile('baz');
      expect(provider.configuration.name).toBe('quz');
    });
  });
});
