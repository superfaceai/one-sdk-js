import * as fs from 'fs';
import { dirname, join as joinPath } from 'path';

import { SuperJson } from '../../internal/superjson';
import * as profileProvider from '../query/profile-provider';
import { SuperfaceClient } from './client';
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
        `Profile not installed: does/not-exist

Hint: Check that the profile is installed in super.json -> profiles["does/not-exist"]
Hint: Profile can be installed using the superface cli tool: \`superface install does/not-exist\`
`
      );
    });

    it('rejects when profile points to a non-exitent path', async () => {
      const client = new SuperfaceClient();

      await expect(client.getProfile('foo')).rejects.toThrow(
        `Profile file at path does not exist: ../foo.supr

Profile "foo" specifies a file path "../foo.supr" in super.json
but this path does not exist or is not accessible

Hint: Check that path in super.json -> profiles["foo"].file exists and is accessible
Hint: Paths in super.json are either absolute or relative to the location of super.json
`
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
        `No configured provider found for profile: foo

Profile "foo" needs at least one configured provider for automatic provider selection

Hint: Check that a provider is configured for a profile in super.json -> profiles["foo"].providers
Hint: Providers can be configured using the superface cli tool: \`superface configure --help\` for more info
`
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
