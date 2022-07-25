import { mocked } from 'ts-jest/utils';

import { ProfileConfiguration, resolveProfileAst } from '../../core';
import { MockClient, mockProfileDocumentNode } from '../../mock';
import { getProviderForProfile, SuperJson } from '../../schema-tools';

const mockSuperJson = new SuperJson({
  profiles: {
    'testy/mctestface': '0.1.0',
    foo: 'file://../foo.supr.ast.json',
    'evil/foo': 'file://../foo.supr',
    'bad/foo': 'file://../foo.ts',
    bar: {
      file: '../bar.supr.ast.json',
      providers: {
        quz: {},
      },
    },
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

afterEach(() => {
  jest.useRealTimers();
  jest.resetAllMocks();
});

jest.mock('../../core/registry');
jest.mock('../../core/profile/resolve-profile-ast');
jest.mock('../../core/events/failure/event-adapter');

describe('superface client', () => {
  describe('getProfile', () => {
    describe('when using without super json', () => {
      it('retruns Profile instance', async () => {
        const ast = mockProfileDocumentNode({
          name: 'testy/mctestface',
          version: {
            major: 1,
            minor: 0,
            patch: 0,
          },
        });
        mocked(resolveProfileAst).mockResolvedValue(ast);
        const client = new MockClient();

        const profile = await client.getProfile('testy/mctestface');

        expect(profile.ast).toEqual(ast);
        expect(profile.configuration).toEqual(
          new ProfileConfiguration('testy/mctestface', '1.0.0')
        );
      });
    });

    describe('when using with super json', () => {
      it('retruns Profile instance', async () => {
        const ast = mockProfileDocumentNode({
          name: 'testy/mctestface',
          version: {
            major: 1,
            minor: 0,
            patch: 0,
          },
        });
        mocked(resolveProfileAst).mockResolvedValue(ast);
        const client = new MockClient(mockSuperJson);

        const profile = await client.getProfile('testy/mctestface');

        expect(profile.ast).toEqual(ast);
        expect(profile.configuration).toEqual(
          new ProfileConfiguration('testy/mctestface', '1.0.0')
        );
      });
    });
  });

  describe('getProviderForProfile', () => {
    it('throws when providers are not configured', async () => {
      expect(() =>
        getProviderForProfile(
          new SuperJson({
            profiles: {
              test: '2.1.0',
            },
            providers: {
              quz: {},
            },
          }),
          'foo'
        )
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
