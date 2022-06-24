import { MockClient } from '~mock';
import { getProviderForProfile, SuperJson } from '~schema-tools';

const mockSuperJson = new SuperJson({
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
});

const mockSuperJsonCustomPath = new SuperJson({
  profiles: {
    test: '2.1.0',
  },
  providers: {
    quz: {},
  },
});

afterEach(() => {
  jest.useRealTimers();
});

jest.mock('../../core/events/failure/event-adapter');

describe('superface client', () => {
  describe('getProfile', () => {
    it('rejects when profile does not exists', async () => {
      const client = new MockClient(mockSuperJson);

      await expect(client.getProfile('does/not-exist')).rejects.toThrow(
        'Hint: Profile can be installed using the superface cli tool: `superface install does/not-exist`'
      );
    });

    it('rejects when profile points to a non-existent path', async () => {
      const client = new MockClient(mockSuperJson, {
        fileSystemOverride: {
          exists: jest.fn(async (path: string) => {
            expect(path).toMatch('foo.supr');

            return false;
          }),
        },
      });

      await expect(client.getProfile('foo')).rejects.toThrow(
        `Profile "foo" specifies a file path "../foo.supr" in super.json
but this path does not exist or is not accessible`
      );
    });

    it('returns a valid profile when it points to existing path', async () => {
      const client = new MockClient(mockSuperJson, {
        fileSystemOverride: {
          exists: jest.fn(async (path: string) => {
            expect(path).toMatch('foo.supr');

            return true;
          }),
        },
      });

      const profile = await client.getProfile('foo');
      expect(profile.configuration.version).toBe('unknown');
    });

    it('returns a valid profile when it points to existing path - known version', async () => {
      const client = new MockClient(mockSuperJson);

      const profile = await client.getProfile('baz');
      expect(profile.configuration.version).toBe('1.2.3');
    });
  });

  describe('getProviderForProfile', () => {
    it('throws when providers are not configured', async () => {
      expect(() =>
        getProviderForProfile(mockSuperJsonCustomPath, 'foo')
      ).toThrow(
        'Profile "foo" needs at least one configured provider for automatic provider selection'
      );
    });

    it('returns a configured provider when present', async () => {
      const provider = getProviderForProfile(mockSuperJson, 'baz');
      expect(provider.configuration.name).toBe('quz');
    });
  });
});
