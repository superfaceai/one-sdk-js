import { SecurityValues } from '@superfaceai/ast';
import { mocked } from 'ts-jest/utils';

import {
  ProfileConfiguration,
  ProviderConfiguration,
  resolveProfileAst,
  superJsonNotDefinedError,
} from '../../core';
import { MockClient, mockProfileDocumentNode } from '../../mock';
import { SuperJson } from '../../schema-tools';

const mockSecurityValues: SecurityValues[] = [
  {
    username: 'test-username',
    id: 'basic',
    password: 'test-password',
  },
  {
    id: 'api',
    apikey: 'test-api-key',
  },
  {
    id: 'bearer',
    token: 'test-token',
  },
  {
    id: 'digest',
    username: 'test-digest-user',
    password: 'test-digest-password',
  },
];

const mockParameters = {
  first: 'plain value',
  second: '$TEST_SECOND', // unset env value without default
  third: '$TEST_THIRD', // unset env value with default
  // fourth is missing - should be resolved to its default
};

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
    'test-profile': {
      version: '1.0.0',
      providers: {
        'test-provider': {},
      },
    },
  },
  providers: {
    fooder: {
      file: '../fooder.provider.json',
      security: [],
    },
    quz: {},
    'test-provider': {
      security: mockSecurityValues,
      parameters: mockParameters,
    },
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

        const profile = await client.getProfile('testy/mctestface@1.0.0');

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

  describe('getProvider', () => {
    describe('when using with super json', () => {
      it('returns Provider instance', async () => {
        const client = new MockClient(mockSuperJson);
        const provider = await client.getProvider('test-provider');

        expect(provider.configuration).toEqual(
          new ProviderConfiguration(
            'test-provider',
            mockSecurityValues,
            mockParameters
          )
        );
      });

      it('returns Provider instance with custom security values and parameters', async () => {
        const client = new MockClient(
          new SuperJson({
            providers: {
              'test-provider': {
                security: [],
              },
            },
          })
        );

        const provider = await client.getProvider('test-provider', {
          security: {
            basic: {
              username: 'test-username',
              password: 'test-password',
            },
            api: {
              apikey: 'test-api-key',
            },
            bearer: {
              token: 'test-token',
            },
            digest: {
              username: 'test-digest-user',
              password: 'test-digest-password',
            },
          },
          parameters: mockParameters,
        });

        expect(provider.configuration).toEqual(
          new ProviderConfiguration(
            'test-provider',
            mockSecurityValues,
            mockParameters
          )
        );
      });
    });

    describe('when using without super json', () => {
      it('returns Provider instance', async () => {
        const client = new MockClient();
        const provider = await client.getProvider('test-provider');

        expect(provider.configuration).toEqual(
          new ProviderConfiguration('test-provider', [])
        );
      });

      it('returns Provider instance with custom security values and parameters', async () => {
        const client = new MockClient();

        const provider = await client.getProvider('test-provider', {
          security: mockSecurityValues,
          parameters: mockParameters,
        });

        expect(provider.configuration).toEqual(
          new ProviderConfiguration(
            'test-provider',
            mockSecurityValues,
            mockParameters
          )
        );
      });
    });
  });

  describe('getProviderForProfile', () => {
    describe('when using with super json', () => {
      it('returns Provider instance', async () => {
        const client = new MockClient(mockSuperJson);
        const provider = await client.getProviderForProfile('test-profile');

        expect(provider.configuration).toEqual(
          new ProviderConfiguration(
            'test-provider',
            mockSecurityValues,
            mockParameters
          )
        );
      });
    });

    describe('when using without super json', () => {
      it('throws error', async () => {
        const client = new MockClient();
        await expect(
          client.getProviderForProfile('test-profile')
        ).rejects.toEqual(superJsonNotDefinedError('getProviderForProfile'));
      });
    });
  });
});
