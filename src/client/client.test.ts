import * as fs from 'fs';

import { SuperJson } from '../internal/superjson';
import { MockClient } from '../test/client';
import { getProviderForProfile } from './client';

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

jest.mock('fs', () => ({
  statSync: jest.fn(),
  readFileSync: jest.fn(),
  promises: {
    access: jest.fn(),
  },
  realpathSync: jest.fn(),
}));
const accessMock = fs.promises.access as jest.Mock;

describe('superface client', () => {
  describe('getProfile', () => {
    it('rejects when profile does not exists', async () => {
      const client = new MockClient(mockSuperJson);

      await expect(client.getProfile('does/not-exist')).rejects.toThrow(
        'Hint: Profile can be installed using the superface cli tool: `superface install does/not-exist`'
      );
    });

    it('rejects when profile points to a non-existent path', async () => {
      const client = new MockClient(mockSuperJson);

      accessMock.mockImplementationOnce((path: string) => {
        expect(path).toMatch('foo.supr');
        throw { code: 'ENOENT' };
      });

      await expect(client.getProfile('foo')).rejects.toThrow(
        `Profile "foo" specifies a file path "../foo.supr" in super.json
but this path does not exist or is not accessible`
      );
    });

    it('returns a valid profile when it points to existing path', async () => {
      const client = new MockClient(mockSuperJson);

      accessMock.mockImplementationOnce(async (path: string) => {
        expect(path).toMatch('foo.supr');

        return undefined;
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
