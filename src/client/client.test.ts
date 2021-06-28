import * as fs from 'fs';
import { dirname, join as joinPath } from 'path';

import { SuperJson } from '../internal/superjson';
import { ok } from '../lib';
import { SuperfaceClient } from './client';
import { registerHooks } from './failure/event-adapter';
import { CircuitBreakerPolicy, Router } from './failure/policies';
import { ProfileConfiguration } from './profile';
import * as profileProvider from './profile-provider';
import { ProviderConfiguration } from './provider';

jest.mock('fs', () => ({
  statSync: jest.fn(),
  readFileSync: jest.fn(),
  promises: {
    access: jest.fn(),
  },
}));

const mockLoadSyn = jest.fn();

jest.mock('./failure/event-adapter');

describe('superface client', () => {
  //Mock env path
  const ENV_VARIABLE = 'SUPERFACE_PATH';
  const originalEnvValue = process.env[ENV_VARIABLE];
  const CUSTOM_PATH = 'somepath';

  //Mock super json for default path
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
      } else {
        throw { code: 'ENOENT' };
      }
    });
    readFileSyncMock.mockImplementation((path: string) => {
      if (path === MOCK_SUPERJSON_PATH) {
        return JSON.stringify(MOCK_SUPERJSON);
      } else if (path === CUSTOM_PATH) {
        return JSON.stringify(MOCK_SUPERJSON_CUSTOM_PATH);
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
    expect(statSyncMock).toHaveBeenCalledTimes(1);
    expect(readFileSyncMock).toHaveBeenCalledTimes(2);

    const clientCached = new SuperfaceClient();
    expect(clientCached.superJson.document).toEqual(MOCK_SUPERJSON);
    // no more calls than before
    expect(statSyncMock).toHaveBeenCalledTimes(1);
    expect(readFileSyncMock).toHaveBeenCalledTimes(2);
  });

  it('caches super.json on custom path files correctly', () => {
    process.env[ENV_VARIABLE] = CUSTOM_PATH;

    const client = new SuperfaceClient();
    expect(client.superJson.document).toEqual(MOCK_SUPERJSON_CUSTOM_PATH);
    expect(statSyncMock).toHaveBeenCalledTimes(1);
    expect(readFileSyncMock).toHaveBeenCalledTimes(1);

    const clientCached = new SuperfaceClient();
    expect(clientCached.superJson.document).toEqual(MOCK_SUPERJSON_CUSTOM_PATH);
    // no more calls than before
    expect(statSyncMock).toHaveBeenCalledTimes(1);
    expect(readFileSyncMock).toHaveBeenCalledTimes(1);
    if (!originalEnvValue) {
      delete process.env[ENV_VARIABLE];
    } else {
      process.env[ENV_VARIABLE] = originalEnvValue;
    }
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
    it('throws when providers are not configured', async () => {
      const client = new SuperfaceClient();

      await expect(client.getProviderForProfile('foo')).rejects.toThrow(
        'Profile "foo" needs at least one configured provider for automatic provider selection'
      );
    });

    it('returns a configured provider when present', async () => {
      const client = new SuperfaceClient();

      const provider = await client.getProviderForProfile('baz');
      expect(provider.configuration.name).toBe('quz');
    });
  });

  describe('hookPolicies', () => {
    //FIX: skiping as we do not call hook policies - remove?
    it.skip('prepares correct object', async () => {
      const mockSuperJson = new SuperJson({
        profiles: {
          ['starwars/character-information']: {
            version: '1.0.0',
            priority: ['first', 'second'],
            providers: {
              first: {},
              second: {},
            },
          },
        },
        providers: {
          first: {
            security: [],
          },
          second: {
            security: [],
          },
        },
      });

      mockLoadSyn.mockReturnValue(ok(mockSuperJson));
      SuperJson.loadSync = mockLoadSyn;
      const client = new SuperfaceClient();
      void client;

      expect(registerHooks).toHaveBeenCalledWith({
        ['starwars/character-information']: {
          queuedAction: undefined,
          router: new Router(
            {
              first: new CircuitBreakerPolicy(
                {
                  profileId: 'starwars/character-information',
                  usecaseName: '',
                  // TODO: Somehow know safety
                  usecaseSafety: 'unsafe',
                },
                //TODO are these defauts ok?
                5,
                60000
              ),
            },
            ['first', 'second'],
            'first'
          ),
        },
      });
    });
  });
});
