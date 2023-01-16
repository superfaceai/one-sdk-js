import type {
  AstMetadata,
  MapDocumentNode,
  SecurityValues,
} from '@superfaceai/ast';
import { HttpScheme, SecurityType } from '@superfaceai/ast';

import type { IFileSystem } from '../../interfaces';
import { err, ok } from '../../lib';
import {
  MockEnvironment,
  MockFileSystem,
  mockMapDocumentNode,
  mockProfileDocumentNode,
  mockProviderJson,
  MockTimers,
} from '../../mock';
import { NodeCrypto, NodeFetch, NodeFileSystem } from '../../node';
import * as SuperJsonMutate from '../../schema-tools/superjson/mutate';
import { normalizeSuperJsonDocument } from '../../schema-tools/superjson/normalize';
import { Config } from '../config';
import {
  invalidMapASTResponseError,
  localProviderAndRemoteMapError,
  profileProviderNotFoundError,
} from '../errors';
import { Events } from '../events';
import { ProviderConfiguration } from '../provider';
import { fetchBind, fetchProviderInfo } from '../registry';
import { ServiceSelector } from '../services';
import { ProfileProvider } from './profile-provider';
import { ProfileProviderConfiguration } from './profile-provider-configuration';

jest.mock('../registry/registry');

const mockConfig = new Config(NodeFileSystem);
const crypto = new NodeCrypto();
const timers = new MockTimers();

describe('profile provider', () => {
  const astMetadata: AstMetadata = {
    sourceChecksum: 'checksum',
    astVersion: {
      major: 1,
      minor: 0,
      patch: 0,
    },
    parserVersion: {
      major: 1,
      minor: 0,
      patch: 0,
    },
  };

  const mockMapDocument = mockMapDocumentNode({
    provider: 'test',
    name: 'test-profile',
  });

  const mockProfileDocument = mockProfileDocumentNode({ name: 'test-profile' });

  const providerJson = mockProviderJson({
    name: 'test',
    parameters: undefined,
  });

  const mockProviderConfiguration: ProviderConfiguration =
    new ProviderConfiguration('test', []);

  const mockProfileProviderConfiguration: ProfileProviderConfiguration =
    new ProfileProviderConfiguration();

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

  let fileSystem: IFileSystem;

  beforeEach(() => {
    fileSystem = MockFileSystem();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('ProfileProvider', () => {
    describe('when binding', () => {
      const mockFetchResponse = {
        provider: providerJson,
        mapAst: mockMapDocument,
      };
      const expectedBoundProfileProvider = {
        profileAst: mockProfileDocument,
        mapAst: mockMapDocument,
        provider: providerJson,
        configuration: {
          services: new ServiceSelector(
            [{ id: 'test-service', baseUrl: 'service/base/url' }],
            'test-service'
          ),
          security: [
            {
              id: 'basic',
              type: SecurityType.HTTP,
              scheme: HttpScheme.BASIC,
              username: 'test-username',
              password: 'test-password',
            },
            {
              id: 'api',
              type: SecurityType.APIKEY,
              apikey: 'test-api-key',
            },
            {
              id: 'bearer',
              type: SecurityType.HTTP,
              scheme: HttpScheme.BEARER,
              token: 'test-token',
            },
            {
              id: 'digest',
              type: SecurityType.HTTP,
              scheme: HttpScheme.DIGEST,
              username: 'test-digest-user',
              password: 'test-digest-password',
            },
          ],
        },
      };

      it('returns new BoundProfileProvider with integration parameters', async () => {
        const mockProviderJsonWithParameters = mockProviderJson({
          name: 'test',
        });
        jest.mocked(fetchBind).mockResolvedValue({
          provider: mockProviderJsonWithParameters,
          mapAst: mockMapDocument,
        });
        const superJson = normalizeSuperJsonDocument(
          {
            profiles: {
              ['test-profile']: {
                version: '1.0.0',
                defaults: {},
                providers: {
                  test: {},
                },
              },
            },
            providers: {
              test: {
                security: mockSecurityValues,
                parameters: {
                  first: 'plain value',
                  second: '$TEST_SECOND', // unset env value without default
                  third: '$TEST_THIRD', // unset env value with default
                  // fourth is missing - should be resolved to its default
                },
              },
            },
          },
          new MockEnvironment()
        );
        const mockProfileProvider = new ProfileProvider(
          superJson,
          mockProfileDocument,
          mockProviderConfiguration,
          mockProfileProviderConfiguration,
          mockConfig,
          new Events(timers),
          fileSystem,
          crypto,
          new NodeFetch(timers)
        );

        const result = await mockProfileProvider.bind();

        expect(result.configuration.parameters).toEqual({
          first: 'plain value',
          second: '$TEST_SECOND',
          third: 'third-default',
          fourth: 'fourth-default',
        });

        expect(result).toMatchObject(expectedBoundProfileProvider);
      });

      it('returns new BoundProfileProvider with custom integration parameters and security', async () => {
        const mockProviderJsonWithParameters = mockProviderJson({
          name: 'test',
        });
        jest.mocked(fetchBind).mockResolvedValue({
          provider: mockProviderJsonWithParameters,
          mapAst: mockMapDocument,
        });
        const superJson = normalizeSuperJsonDocument(
          {
            profiles: {
              'test-profile': {
                version: '1.0.0',
                defaults: {},
                providers: {
                  test: {},
                },
              },
            },
            providers: {
              test: {},
            },
          },
          new MockEnvironment()
        );
        const mockProfileProvider = new ProfileProvider(
          superJson,
          mockProfileDocument,
          new ProviderConfiguration('test', mockSecurityValues, {
            first: 'plain value',
            second: '$TEST_SECOND', // unset env value without default
            third: '$TEST_THIRD', // unset env value with default
            // fourth is missing - should be resolved to its default
          }),

          mockProfileProviderConfiguration,
          mockConfig,
          new Events(timers),
          fileSystem,
          crypto,
          new NodeFetch(timers)
        );

        const result = await mockProfileProvider.bind();

        expect(result.configuration.parameters).toEqual({
          first: 'plain value',
          second: '$TEST_SECOND',
          third: 'third-default',
          fourth: 'fourth-default',
        });

        expect(result).toMatchObject(expectedBoundProfileProvider);
      });

      it('returns new BoundProfileProvider', async () => {
        jest.mocked(fetchBind).mockResolvedValue(mockFetchResponse);
        const superJson = normalizeSuperJsonDocument(
          {
            profiles: {
              ['test-profile']: {
                version: '1.0.0',
                defaults: {},
                providers: {
                  test: {},
                },
              },
            },
            providers: {
              test: {
                security: mockSecurityValues,
              },
            },
          },
          new MockEnvironment()
        );
        const mockProfileProvider = new ProfileProvider(
          superJson,
          mockProfileDocument,
          mockProviderConfiguration,
          mockProfileProviderConfiguration,
          mockConfig,
          new Events(timers),
          fileSystem,
          crypto,
          new NodeFetch(timers)
        );

        const result = await mockProfileProvider.bind();

        expect(result).toMatchObject(expectedBoundProfileProvider);
        // It should cache the provider
        expect(fileSystem.writeFile).toHaveBeenCalled();
      });

      it('returns new BoundProfileProvider without caching provider', async () => {
        const mockConfigWithDisabledCache = new Config(NodeFileSystem, {
          cache: false,
        });

        jest.mocked(fetchBind).mockResolvedValue(mockFetchResponse);
        const superJson = normalizeSuperJsonDocument(
          {
            profiles: {
              'test-profile': {
                version: '1.0.0',
                defaults: {},
                providers: {
                  test: {},
                },
              },
            },
            providers: {
              test: {
                security: mockSecurityValues,
              },
            },
          },
          new MockEnvironment()
        );
        const mockProfileProvider = new ProfileProvider(
          superJson,
          mockProfileDocument,
          mockProviderConfiguration,
          mockProfileProviderConfiguration,
          mockConfigWithDisabledCache,
          new Events(timers),
          fileSystem,
          crypto,
          new NodeFetch(timers)
        );

        const result = await mockProfileProvider.bind();

        expect(result).toMatchObject(expectedBoundProfileProvider);
        // It should not cache the provider
        expect(fileSystem.writeFile).not.toHaveBeenCalled();
      });

      it('returns new BoundProfileProvider use profile id', async () => {
        jest.mocked(fetchBind).mockResolvedValue(mockFetchResponse);
        const superJson = normalizeSuperJsonDocument(
          {
            profiles: {
              ['test-profile']: {
                version: '1.0.0',
                defaults: {},
                providers: {
                  test: {},
                },
              },
            },
            providers: {
              test: {
                security: mockSecurityValues,
              },
            },
          },
          new MockEnvironment()
        );

        fileSystem.readFile = () =>
          Promise.resolve(ok(JSON.stringify(mockProfileDocument)));

        const mockProfileProvider = new ProfileProvider(
          superJson,
          mockProfileDocument,
          mockProviderConfiguration,
          mockProfileProviderConfiguration,
          mockConfig,
          new Events(timers),
          fileSystem,
          crypto,
          new NodeFetch(timers)
        );

        const result = await mockProfileProvider.bind();

        expect(result).toMatchObject(expectedBoundProfileProvider);
      });

      it('returns new BoundProfileProvider use profile configuration', async () => {
        jest.mocked(fetchBind).mockResolvedValue(mockFetchResponse);
        const superJson = normalizeSuperJsonDocument(
          {
            profiles: {
              ['test-profile']: {
                version: '1.0.0',
                defaults: {},
                providers: {
                  test: {},
                },
              },
            },
            providers: {
              test: {
                security: mockSecurityValues,
              },
            },
          },
          new MockEnvironment()
        );

        fileSystem.readFile = () =>
          Promise.resolve(ok(JSON.stringify(mockProfileDocument)));

        const mockProfileProvider = new ProfileProvider(
          superJson,
          mockProfileDocument,
          mockProviderConfiguration,
          mockProfileProviderConfiguration,
          mockConfig,
          new Events(timers),
          fileSystem,
          crypto,
          new NodeFetch(timers)
        );

        const result = await mockProfileProvider.bind();

        expect(result).toMatchObject(expectedBoundProfileProvider);
      });

      it('returns new BoundProfileProvider load locally', async () => {
        jest.mocked(fetchBind).mockResolvedValue(mockFetchResponse);
        const superJson = normalizeSuperJsonDocument(
          {
            profiles: {
              ['test-profile']: {
                file: '../some/file.supr',
                version: '1.0.0',
                defaults: {},
                providers: {
                  test: {
                    file: '../some/file.suma',
                  },
                },
              },
            },
            providers: {
              test: {
                file: '../some/file.json',
                security: mockSecurityValues,
              },
            },
          },
          new MockEnvironment()
        );

        fileSystem.readFile = jest
          .fn()
          .mockResolvedValueOnce(ok(JSON.stringify(providerJson)))
          .mockResolvedValueOnce(ok(JSON.stringify(mockMapDocument)));

        const mockProfileProvider = new ProfileProvider(
          superJson,
          mockProfileDocument,
          mockProviderConfiguration,
          mockProfileProviderConfiguration,
          mockConfig,
          new Events(timers),
          fileSystem,
          crypto,
          new NodeFetch(timers)
        );

        const result = await mockProfileProvider.bind();

        expect(result).toMatchObject(expectedBoundProfileProvider);
      });

      it('returns new BoundProfileProvider load localy and use map variant', async () => {
        jest.mocked(fetchBind).mockResolvedValue(mockFetchResponse);
        fileSystem.readFile = jest
          .fn()
          .mockResolvedValueOnce(ok(JSON.stringify(providerJson)))
          .mockResolvedValueOnce(ok(JSON.stringify(mockMapDocument)));
        const superJson = normalizeSuperJsonDocument(
          {
            profiles: {
              ['test-profile']: {
                version: '1.0.0',
                defaults: {},
                providers: {
                  test: {
                    file: '../some/file.suma',
                  },
                },
              },
            },
            providers: {
              test: {
                file: '../some/file.json',
                security: mockSecurityValues,
              },
            },
          },
          new MockEnvironment()
        );

        const mockProfileProvider = new ProfileProvider(
          superJson,
          mockProfileDocument,
          mockProviderConfiguration,
          mockProfileProviderConfiguration,
          mockConfig,
          new Events(timers),
          fileSystem,
          crypto,
          new NodeFetch(timers)
        );

        const result = await mockProfileProvider.bind();

        expect(result).toMatchObject(expectedBoundProfileProvider);
      });

      it('returns new BoundProfileProvider with passed map variant and revision', async () => {
        jest.mocked(fetchBind).mockResolvedValue(mockFetchResponse);
        const superJson = normalizeSuperJsonDocument(
          {
            profiles: {
              ['test-profile']: {
                version: '1.0.0',
                defaults: {},
                providers: {
                  test: {},
                },
              },
            },
            providers: {
              test: {
                security: mockSecurityValues,
              },
            },
          },

          new MockEnvironment()
        );
        const mockFetchInstance = new NodeFetch(timers);

        fileSystem.readFile = () =>
          Promise.resolve(ok(JSON.stringify(mockProfileDocument)));

        const mockProfileProvider = new ProfileProvider(
          superJson,
          mockProfileDocument,
          mockProviderConfiguration,
          new ProfileProviderConfiguration('test-revision', 'test-variant'),
          mockConfig,
          new Events(timers),
          fileSystem,
          crypto,
          mockFetchInstance
        );

        const result = await mockProfileProvider.bind();

        expect(result).toMatchObject(expectedBoundProfileProvider);
        expect(fetchBind).toHaveBeenCalledWith(
          {
            profileId: 'test-profile@1.0.0',
            provider: 'test',
            mapVariant: 'test-variant',
            mapRevision: 'test-revision',
          },
          mockConfig,
          crypto,
          mockFetchInstance,
          undefined
        );
      });

      it('returns new BoundProfileProvider when map is provided locally but provider is not', async () => {
        jest.mocked(fetchBind).mockResolvedValue(mockFetchResponse);
        const superJson = normalizeSuperJsonDocument(
          {
            profiles: {
              ['test-profile']: {
                version: '1.0.0',
                defaults: {},
                providers: {
                  test: {
                    file: '../some/file.suma',
                  },
                },
              },
            },
            providers: {
              test: {
                security: mockSecurityValues,
              },
            },
          },
          new MockEnvironment()
        );

        fileSystem.readFile = jest
          .fn()
          .mockResolvedValueOnce(ok(JSON.stringify(mockMapDocument)));

        jest.mocked(fetchProviderInfo).mockResolvedValue(providerJson);

        const mockProfileProvider = new ProfileProvider(
          superJson,
          mockProfileDocument,
          mockProviderConfiguration,
          mockProfileProviderConfiguration,
          mockConfig,
          new Events(timers),
          fileSystem,
          crypto,
          new NodeFetch(timers)
        );
        const result = await mockProfileProvider.bind();

        expect(result).toMatchObject(expectedBoundProfileProvider);
        // It should cache the provider
        expect(fileSystem.writeFile).toHaveBeenCalled();
      });

      it('loads provider from cache when fetch fails', async () => {
        jest.mocked(fetchBind).mockResolvedValue(mockFetchResponse);
        const superJson = normalizeSuperJsonDocument(
          {
            profiles: {
              ['test-profile']: {
                version: '1.0.0',
                defaults: {},
                providers: {
                  test: {
                    file: '../some/file.suma',
                  },
                },
              },
            },
            providers: {
              test: {
                security: mockSecurityValues,
              },
            },
          },
          new MockEnvironment()
        );

        fileSystem.path.resolve = jest
          .fn()
          .mockReturnValue('file://some/path/to');

        fileSystem.readFile = jest
          .fn()
          .mockResolvedValueOnce(ok(JSON.stringify(mockMapDocument)))
          .mockResolvedValueOnce(ok(JSON.stringify(providerJson)));

        jest.mocked(fetchProviderInfo).mockRejectedValue('denied!');

        const mockProfileProvider = new ProfileProvider(
          superJson,
          mockProfileDocument,
          mockProviderConfiguration,
          mockProfileProviderConfiguration,
          mockConfig,
          new Events(timers),
          fileSystem,
          crypto,
          new NodeFetch(timers)
        );
        const result = await mockProfileProvider.bind();

        expect(result).toMatchObject(expectedBoundProfileProvider);
        expect(fileSystem.readFile).toHaveBeenCalledTimes(2);
      });

      it('throws when both fetch and cache read fails', async () => {
        jest.mocked(fetchBind).mockResolvedValue(mockFetchResponse);
        const superJson = normalizeSuperJsonDocument(
          {
            profiles: {
              ['test-profile']: {
                version: '1.0.0',
                defaults: {},
                providers: {
                  test: {
                    file: '.../some/file.suma',
                  },
                },
              },
            },
            providers: {
              test: {},
            },
          },
          new MockEnvironment()
        );

        fileSystem.path.resolve = jest
          .fn()
          .mockReturnValue('file://some/path/to');

        fileSystem.readFile = jest
          .fn()
          .mockResolvedValueOnce(ok(JSON.stringify(mockMapDocument)))
          .mockRejectedValueOnce(err('denied!'));

        jest.mocked(fetchProviderInfo).mockRejectedValue('denied!');

        const mockProfileProvider = new ProfileProvider(
          superJson,
          mockProfileDocument,
          mockProviderConfiguration,
          mockProfileProviderConfiguration,
          mockConfig,
          new Events(timers),
          fileSystem,
          crypto,
          new NodeFetch(timers)
        );

        await expect(() => mockProfileProvider.bind()).rejects.toMatchObject({
          error: 'denied!',
        });
        expect(fileSystem.readFile).toHaveBeenCalledTimes(2);
      });

      it('throws error when provider is provided locally but map is not', async () => {
        const superJson = normalizeSuperJsonDocument(
          {
            profiles: {
              ['test-profile']: {
                version: '1.0.0',
                defaults: {},
                providers: {
                  test: {},
                },
              },
            },
            providers: {
              test: {
                file: 'file://some/file',
              },
            },
          },
          new MockEnvironment()
        );

        fileSystem.readFile = jest
          .fn()
          .mockResolvedValueOnce(ok(JSON.stringify(providerJson)));

        const mockProfileProvider = new ProfileProvider(
          superJson,
          mockProfileDocument,
          mockProviderConfiguration,
          mockProfileProviderConfiguration,
          mockConfig,
          new Events(timers),
          fileSystem,
          crypto,
          new NodeFetch(timers)
        );

        await expect(() => mockProfileProvider.bind()).rejects.toThrow(
          localProviderAndRemoteMapError(
            providerJson.name,
            mockProfileDocument.header.name
          )
        );
      });

      it('throws error without profile provider settings', async () => {
        jest.mocked(fetchBind).mockResolvedValue(mockFetchResponse);
        const superJson = normalizeSuperJsonDocument(
          {
            profiles: {
              ['test-profile']: {
                file: 'file://some/file',
                version: '1.0.0',
                defaults: {},
                providers: {},
              },
            },
            providers: {
              test: {
                security: mockSecurityValues,
              },
            },
          },
          new MockEnvironment()
        );

        jest
          .mocked(fileSystem.readFile)
          .mockResolvedValueOnce(ok(JSON.stringify(mockProfileDocument)))
          .mockResolvedValueOnce(ok(JSON.stringify(mockProviderJson)))
          .mockResolvedValueOnce(ok(JSON.stringify(mockMapDocument)));

        const mockProfileProvider = new ProfileProvider(
          superJson,
          mockProfileDocument,
          mockProviderConfiguration,
          mockProfileProviderConfiguration,
          mockConfig,
          new Events(timers),
          fileSystem,
          crypto,
          new NodeFetch(timers)
        );
        await expect(mockProfileProvider.bind()).rejects.toThrow(
          profileProviderNotFoundError('test-profile', providerJson.name)
        );
      });

      it('throws error when bind response contains invalid map AST', async () => {
        jest.mocked(fetchBind).mockResolvedValue({
          ...mockFetchResponse,
          mapAst: undefined,
        });
        const superJson = normalizeSuperJsonDocument(
          {
            profiles: {
              ['test-profile']: {
                file: 'file://some/file',
                version: '1.0.0',
                defaults: {},
                providers: {
                  test: {},
                },
              },
            },
            providers: {
              test: {
                security: mockSecurityValues,
              },
            },
          },
          new MockEnvironment()
        );

        jest
          .mocked(fileSystem.readFile)
          .mockResolvedValueOnce(ok(JSON.stringify(mockProfileDocument)))
          .mockResolvedValueOnce(ok(JSON.stringify(mockProviderJson)));

        const mockProfileProvider = new ProfileProvider(
          superJson,
          mockProfileDocument,
          mockProviderConfiguration,
          mockProfileProviderConfiguration,
          mockConfig,
          new Events(timers),
          fileSystem,
          crypto,
          new NodeFetch(timers)
        );
        await expect(() => mockProfileProvider.bind()).rejects.toThrow(
          invalidMapASTResponseError()
        );
      });

      it('returns new BoundProfileProvider with merged security', async () => {
        const mergeSecuritySpy = jest.spyOn(SuperJsonMutate, 'mergeSecurity');
        mergeSecuritySpy.mockReturnValue([
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
        ]);
        jest.mocked(fetchBind).mockResolvedValue(mockFetchResponse);

        const superJson = normalizeSuperJsonDocument(
          {
            profiles: {
              ['test-profile']: {
                version: '1.0.0',
                defaults: {},
                providers: {
                  test: {},
                },
              },
            },
            providers: {
              test: {
                security: [],
              },
            },
          },
          new MockEnvironment()
        );
        const mockProfileProvider = new ProfileProvider(
          superJson,
          mockProfileDocument,
          mockProviderConfiguration,
          mockProfileProviderConfiguration,
          mockConfig,
          new Events(timers),
          fileSystem,
          crypto,
          new NodeFetch(timers)
        );

        const result = await mockProfileProvider.bind({ security: [] });

        expect(result).toMatchObject(expectedBoundProfileProvider);
        mergeSecuritySpy.mockRestore();
      });

      it('throws error when could not find scheme', async () => {
        const superJson = normalizeSuperJsonDocument(
          {
            profiles: {
              ['test-profile']: {
                version: '1.0.0',
                defaults: {},
                providers: {
                  test: {},
                },
              },
            },
            providers: {
              test: {
                security: [
                  {
                    username: 'test-username',
                    id: 'made-up-id',
                    password: 'test-password',
                  },
                ],
              },
            },
          } as any,
          new MockEnvironment()
        );
        jest.mocked(fetchBind).mockResolvedValue(mockFetchResponse);

        const mockProfileProvider = new ProfileProvider(
          superJson,
          mockProfileDocument,
          new ProviderConfiguration('test', []),
          mockProfileProviderConfiguration,
          mockConfig,
          new Events(timers),
          fileSystem,
          crypto,
          new NodeFetch(timers)
        );

        await expect(mockProfileProvider.bind()).rejects.toThrow(
          `The provider definition for "test" defines these security schemes: basic, api, bearer, digest
but a secret value was provided for security scheme: made-up-id`
        );
      });

      it('throws error on invalid api key scheme', async () => {
        const superJson = normalizeSuperJsonDocument(
          {
            profiles: {
              ['test-profile']: {
                version: '1.0.0',
                defaults: {},
                providers: {
                  test: {},
                },
              },
            },
            providers: {
              test: {
                security: [
                  {
                    id: 'api',
                    password: 'test-password',
                  },
                ],
              },
            },
          } as any,
          new MockEnvironment()
        );

        jest.mocked(fetchBind).mockResolvedValue(mockFetchResponse);

        const mockProfileProvider = new ProfileProvider(
          superJson,
          mockProfileDocument,
          new ProviderConfiguration('test', []),
          mockProfileProviderConfiguration,
          mockConfig,
          new Events(timers),
          fileSystem,
          crypto,
          new NodeFetch(timers)
        );

        await expect(mockProfileProvider.bind()).rejects.toThrow(
          `The provided security values with id "api" have keys: password
but apiKey scheme requires: apikey`
        );
      });

      it('throws error on invalid basic auth scheme', async () => {
        const superJson = normalizeSuperJsonDocument(
          {
            profiles: {
              ['test-profile']: {
                version: '1.0.0',
                defaults: {},
                providers: {
                  test: {},
                },
              },
            },
            providers: {
              test: {
                security: [
                  {
                    id: 'basic',
                    password: 'test-password',
                  },
                ],
              },
            },
          } as any,
          new MockEnvironment()
        );

        jest.mocked(fetchBind).mockResolvedValue(mockFetchResponse);

        const mockProfileProvider = new ProfileProvider(
          superJson,
          mockProfileDocument,
          new ProviderConfiguration('test', []),
          mockProfileProviderConfiguration,
          mockConfig,
          new Events(timers),
          fileSystem,
          crypto,
          new NodeFetch(timers)
        );

        await expect(mockProfileProvider.bind()).rejects.toThrow(
          `The provided security values with id "basic" have keys: password
but http scheme requires: username, password`
        );
      });

      it('throws error on invalid bearer auth scheme', async () => {
        const superJson = normalizeSuperJsonDocument(
          {
            profiles: {
              ['test-profile']: {
                version: '1.0.0',
                defaults: {},
                providers: {
                  test: {},
                },
              },
            },
            providers: {
              test: {
                security: [
                  {
                    id: 'bearer',
                    password: 'test-password',
                  },
                ],
              },
            },
          } as any,
          new MockEnvironment()
        );

        jest.mocked(fetchBind).mockResolvedValue(mockFetchResponse);

        const mockProfileProvider = new ProfileProvider(
          superJson,
          mockProfileDocument,
          new ProviderConfiguration('test', []),
          mockProfileProviderConfiguration,
          mockConfig,
          new Events(timers),
          fileSystem,
          crypto,
          new NodeFetch(timers)
        );

        await expect(mockProfileProvider.bind()).rejects.toThrow(
          `The provided security values with id "bearer" have keys: password
but http scheme requires: token`
        );
      });

      it('throws error on invalid digest auth scheme', async () => {
        const superJson = normalizeSuperJsonDocument(
          {
            profiles: {
              ['test-profile']: {
                version: '1.0.0',
                defaults: {},
                providers: {
                  test: {},
                },
              },
            },
            providers: {
              test: {
                security: [
                  {
                    id: 'digest',
                    password: 'test-password',
                  },
                ],
              },
            },
          } as any,
          new MockEnvironment()
        );

        jest.mocked(fetchBind).mockResolvedValue(mockFetchResponse);

        const mockProfileProvider = new ProfileProvider(
          superJson,
          mockProfileDocument,
          new ProviderConfiguration('test', []),
          mockProfileProviderConfiguration,
          mockConfig,
          new Events(timers),
          fileSystem,
          crypto,
          new NodeFetch(timers)
        );

        await expect(mockProfileProvider.bind()).rejects.toThrow(
          `The provided security values with id "digest" have keys: password
but http scheme requires: digest`
        );
      });

      it('throws when super.json and provider.json provider names do not match', async () => {
        jest.mocked(fetchBind).mockResolvedValue(mockFetchResponse);
        const superJson = normalizeSuperJsonDocument(
          {
            profiles: {
              ['test-profile']: {
                file: 'file://some/profile/file',
                version: '1.0.0',
                defaults: {},
                providers: {
                  test: {
                    file: 'file://some/map/file',
                  },
                },
              },
            },
            providers: {
              'test-boop': {
                file: 'file://some/provider/file',
                security: [],
              },
            },
          },
          new MockEnvironment()
        );

        jest
          .mocked(fileSystem.readFile)
          .mockResolvedValueOnce(ok(JSON.stringify(providerJson)))
          .mockResolvedValueOnce(ok(JSON.stringify(mockMapDocument)));

        const providerConfiguration = new ProviderConfiguration(
          'test-boop',
          []
        );

        const mockProfileProvider = new ProfileProvider(
          superJson,
          mockProfileDocument,
          providerConfiguration,
          mockProfileProviderConfiguration,
          mockConfig,
          new Events(timers),
          fileSystem,
          crypto,
          new NodeFetch(timers)
        );

        await expect(mockProfileProvider.bind()).rejects.toThrow(
          'Provider name in provider.json does not match provider name in configuration'
        );
      });

      it('throws when super.json and map provider names do not match', async () => {
        jest.mocked(fetchBind).mockResolvedValue(mockFetchResponse);

        const superJson = normalizeSuperJsonDocument(
          {
            profiles: {
              ['test-profile']: {
                file: '../some/profile/file.supr',
                version: '1.0.0',
                defaults: {},
                providers: {
                  test: {
                    file: '../some/map/file.suma',
                  },
                },
              },
            },
            providers: {
              test: {
                file: '../some/provider/file.json',
                security: [],
              },
            },
          },
          new MockEnvironment()
        );

        const mockMapDocumentBoop: MapDocumentNode = {
          astMetadata,
          kind: 'MapDocument',
          header: {
            kind: 'MapHeader',
            profile: {
              name: 'different-test-profile',
              scope: 'some-map-scope',
              version: {
                major: 1,
                minor: 0,
                patch: 0,
              },
            },
            provider: 'test-boop',
          },
          definitions: [],
        };

        fileSystem.readFile = jest
          .fn()
          .mockResolvedValueOnce(ok(JSON.stringify(providerJson)))
          .mockResolvedValueOnce(ok(JSON.stringify(mockMapDocumentBoop)));

        const mockProfileProvider = new ProfileProvider(
          superJson,
          mockProfileDocument,
          mockProviderConfiguration,
          mockProfileProviderConfiguration,
          mockConfig,
          new Events(timers),
          fileSystem,
          crypto,
          new NodeFetch(timers)
        );

        await expect(mockProfileProvider.bind()).rejects.toThrow(
          'Provider name in map does not match provider name in configuration'
        );
      });
    });
  });
});
