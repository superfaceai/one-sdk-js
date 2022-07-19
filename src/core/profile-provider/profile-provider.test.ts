import {
  ApiKeyPlacement,
  AstMetadata,
  HttpScheme,
  MapDocumentNode,
  ProfileDocumentNode,
  ProviderJson,
  SecurityType,
  SecurityValues,
} from '@superfaceai/ast';
import { mocked } from 'ts-jest/utils';

import { err, ok } from '../../lib';
import { MockFileSystem, MockTimers } from '../../mock';
import { NodeCrypto, NodeFetch, NodeFileSystem } from '../../node';
import { SuperJson } from '../../schema-tools';
import * as SuperJsonMutate from '../../schema-tools/superjson/mutate';
import { Config } from '../config';
import { localProviderAndRemoteMapError } from '../errors';
import { Events } from '../events';
import { IFileSystem } from '../interfaces';
import { Parser } from '../parser';
import { ProfileConfiguration } from '../profile';
import { ProviderConfiguration } from '../provider';
import { fetchBind, fetchMapSource, fetchProviderInfo } from '../registry';
import { ServiceSelector } from '../services';
import { ProfileProvider } from './profile-provider';

jest.mock('../registry/registry');
jest.mock('../parser/parser');

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

  const mockMapDocument: MapDocumentNode = {
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
      provider: 'test',
    },
    definitions: [],
  };

  const mockProfileDocument: ProfileDocumentNode = {
    astMetadata,
    kind: 'ProfileDocument',
    header: {
      kind: 'ProfileHeader',
      name: 'test-profile',
      version: {
        major: 1,
        minor: 0,
        patch: 0,
      },
    },
    definitions: [],
  };

  const mockProviderJson: ProviderJson = {
    name: 'test',
    services: [{ id: 'test-service', baseUrl: 'service/base/url' }],
    securitySchemes: [
      {
        type: SecurityType.HTTP,
        id: 'basic',
        scheme: HttpScheme.BASIC,
      },
      {
        id: 'api',
        type: SecurityType.APIKEY,
        in: ApiKeyPlacement.HEADER,
        name: 'Authorization',
      },
      {
        id: 'bearer',
        type: SecurityType.HTTP,
        scheme: HttpScheme.BEARER,
        bearerFormat: 'some',
      },
      {
        id: 'digest',
        type: SecurityType.HTTP,
        scheme: HttpScheme.DIGEST,
      },
    ],
    defaultService: 'test-service',
  };

  const mockProviderConfiguration: ProviderConfiguration =
    new ProviderConfiguration('test', []);

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
        provider: mockProviderJson,
        mapAst: mockMapDocument,
      };
      const expectedBoundProfileProvider = {
        profileAst: mockProfileDocument,
        mapAst: mockMapDocument,
        provider: mockProviderJson,
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
        const mockProviderJsonWithParameters: ProviderJson = {
          name: 'test',
          services: [{ id: 'test-service', baseUrl: 'service/base/url' }],
          securitySchemes: [
            {
              type: SecurityType.HTTP,
              id: 'basic',
              scheme: HttpScheme.BASIC,
            },
            {
              id: 'api',
              type: SecurityType.APIKEY,
              in: ApiKeyPlacement.HEADER,
              name: 'Authorization',
            },
            {
              id: 'bearer',
              type: SecurityType.HTTP,
              scheme: HttpScheme.BEARER,
              bearerFormat: 'some',
            },
            {
              id: 'digest',
              type: SecurityType.HTTP,
              scheme: HttpScheme.DIGEST,
            },
          ],
          defaultService: 'test-service',
          parameters: [
            {
              name: 'first',
              description: 'first test value',
            },
            {
              name: 'second',
            },
            {
              name: 'third',
              default: 'third-default',
            },
            {
              name: 'fourth',
              default: 'fourth-default',
            },
          ],
        };
        mocked(fetchBind).mockResolvedValue({
          provider: mockProviderJsonWithParameters,
          mapAst: mockMapDocument,
        });
        const superJson = new SuperJson({
          profiles: {
            'test-profile': {
              version: '1.0.0',
              defaults: {},
              providers: {},
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
        });
        const mockProfileProvider = new ProfileProvider(
          superJson,
          mockProfileDocument,
          mockProviderConfiguration,
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
        mocked(fetchBind).mockResolvedValue(mockFetchResponse);
        const superJson = new SuperJson({
          profiles: {
            'test-profile': {
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
        });
        const mockProfileProvider = new ProfileProvider(
          superJson,
          mockProfileDocument,
          mockProviderConfiguration,
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

        mocked(fetchBind).mockResolvedValue(mockFetchResponse);
        const superJson = new SuperJson({
          profiles: {
            'test-profile': {
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
        });
        const mockProfileProvider = new ProfileProvider(
          superJson,
          mockProfileDocument,
          mockProviderConfiguration,
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
        mocked(fetchBind).mockResolvedValue(mockFetchResponse);
        const superJson = new SuperJson({
          profiles: {
            'test-profile': {
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
        });

        fileSystem.readFile = () =>
          Promise.resolve(ok(JSON.stringify(mockProfileDocument)));

        const mockProfileProvider = new ProfileProvider(
          superJson,
          'test-profile',
          mockProviderConfiguration,
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
        mocked(fetchBind).mockResolvedValue(mockFetchResponse);
        const superJson = new SuperJson({
          profiles: {
            'test-profile': {
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
        });

        fileSystem.readFile = () =>
          Promise.resolve(ok(JSON.stringify(mockProfileDocument)));

        const mockProfileProvider = new ProfileProvider(
          superJson,
          new ProfileConfiguration('test-profile', '1.0.0'),
          mockProviderConfiguration,
          mockConfig,
          new Events(timers),
          fileSystem,
          crypto,
          new NodeFetch(timers)
        );

        const result = await mockProfileProvider.bind();

        expect(result).toMatchObject(expectedBoundProfileProvider);
      });

      it('returns new BoundProfileProvider get map source affter failed validation', async () => {
        const mockMapSource = 'test source';
        mocked(fetchBind).mockResolvedValue({
          provider: mockFetchResponse.provider,
          mapAst: undefined,
        });
        const superJson = new SuperJson({
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
        });

        mocked(fetchMapSource).mockResolvedValue(mockMapSource);

        jest
          .spyOn(Parser, 'parseMap')
          .mockResolvedValue(mockFetchResponse.mapAst);

        fileSystem.readFile = () =>
          Promise.resolve(ok(JSON.stringify(mockProfileDocument)));

        const mockProfileProvider = new ProfileProvider(
          superJson,
          new ProfileConfiguration('test-profile', '1.0.0'),
          mockProviderConfiguration,
          mockConfig,
          new Events(timers),
          fileSystem,
          crypto,
          new NodeFetch(timers)
        );

        const result = await mockProfileProvider.bind();

        expect(result).toMatchObject(expectedBoundProfileProvider);
      });

      it('returns new BoundProfileProvider load localy', async () => {
        mocked(fetchBind).mockResolvedValue(mockFetchResponse);
        const superJson = new SuperJson({
          profiles: {
            'test-profile': {
              file: 'file://some/file',
              version: '1.0.0',
              defaults: {},
              providers: {
                test: {
                  file: 'file://some/file',
                },
              },
            },
          },
          providers: {
            test: {
              file: 'file://some/file',
              security: mockSecurityValues,
            },
          },
        });

        fileSystem.readFile = jest
          .fn()
          .mockResolvedValueOnce(ok(JSON.stringify(mockProfileDocument)))
          .mockResolvedValueOnce(ok(JSON.stringify(mockProviderJson)))
          .mockResolvedValueOnce(ok(JSON.stringify(mockMapDocument)));

        const mockProfileProvider = new ProfileProvider(
          superJson,
          'test-profile',
          mockProviderConfiguration,
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
        mocked(fetchBind).mockResolvedValue(mockFetchResponse);
        fileSystem.readFile = jest
          .fn()
          .mockResolvedValueOnce(ok(JSON.stringify(mockProfileDocument)))
          .mockResolvedValueOnce(ok(JSON.stringify(mockProviderJson)))
          .mockResolvedValueOnce(ok(JSON.stringify(mockMapDocument)));
        const superJson = new SuperJson({
          profiles: {
            'test-profile': {
              version: '1.0.0',
              defaults: {},
              providers: {
                test: {
                  file: 'file://some/file',
                },
              },
            },
          },
          providers: {
            test: {
              file: 'file://some/file',
              security: mockSecurityValues,
            },
          },
        });

        const mockProfileProvider = new ProfileProvider(
          superJson,
          'test-profile',
          mockProviderConfiguration,
          mockConfig,
          new Events(timers),
          fileSystem,
          crypto,
          new NodeFetch(timers)
        );

        const result = await mockProfileProvider.bind();

        expect(result).toMatchObject(expectedBoundProfileProvider);
      });

      it('throws error without profile settings', async () => {
        mocked(fetchBind).mockResolvedValue(mockFetchResponse);
        const superJson = new SuperJson({
          profiles: {},
          providers: {
            test: {
              file: 'file://some/file',
              security: [],
            },
          },
        });

        fileSystem.readFile = jest
          .fn()
          .mockResolvedValueOnce(ok(JSON.stringify(mockProfileDocument)))
          .mockResolvedValueOnce(ok(JSON.stringify(mockProviderJson)))
          .mockResolvedValueOnce(ok(JSON.stringify(mockMapDocument)));

        const mockProfileProvider = new ProfileProvider(
          superJson,
          'test-profile',
          'test',
          mockConfig,
          new Events(timers),
          fileSystem,
          crypto,
          new NodeFetch(timers)
        );
        await expect(mockProfileProvider.bind()).rejects.toThrow(
          'Hint: Profiles can be installed using the superface cli tool: `superface install --help` for more info'
        );
      });

      it('returns new BoundProfileProvider when map is provided locally but provider is not', async () => {
        mocked(fetchBind).mockResolvedValue(mockFetchResponse);
        const superJson = new SuperJson({
          profiles: {
            'test-profile': {
              version: '1.0.0',
              defaults: {},
              providers: {
                test: {
                  file: 'file://some/file',
                },
              },
            },
          },
          providers: {
            test: {
              security: mockSecurityValues,
            },
          },
        });

        fileSystem.readFile = jest
          .fn()
          .mockResolvedValueOnce(ok(JSON.stringify(mockProfileDocument)))
          .mockResolvedValueOnce(ok(JSON.stringify(mockMapDocument)));

        mocked(fetchProviderInfo).mockResolvedValue(mockProviderJson);

        const mockProfileProvider = new ProfileProvider(
          superJson,
          'test-profile',
          mockProviderConfiguration,
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
        mocked(fetchBind).mockResolvedValue(mockFetchResponse);
        const superJson = new SuperJson({
          profiles: {
            'test-profile': {
              version: '1.0.0',
              defaults: {},
              providers: {
                test: {
                  file: 'file://some/file',
                },
              },
            },
          },
          providers: {
            test: {
              security: mockSecurityValues,
            },
          },
        });

        fileSystem.path.resolve = jest
          .fn()
          .mockReturnValue('file://some/path/to');

        fileSystem.readFile = jest
          .fn()
          .mockResolvedValueOnce(ok(JSON.stringify(mockProfileDocument)))
          .mockResolvedValueOnce(ok(JSON.stringify(mockMapDocument)))
          .mockResolvedValueOnce(ok(JSON.stringify(mockProviderJson)));

        mocked(fetchProviderInfo).mockRejectedValue('denied!');

        const mockProfileProvider = new ProfileProvider(
          superJson,
          'test-profile',
          mockProviderConfiguration,
          mockConfig,
          new Events(timers),
          fileSystem,
          crypto,
          new NodeFetch(timers)
        );
        const result = await mockProfileProvider.bind();

        expect(result).toMatchObject(expectedBoundProfileProvider);
        expect(fileSystem.readFile).toHaveBeenCalledTimes(3);
      });

      it('throws when both fetch and cache read fails', async () => {
        mocked(fetchBind).mockResolvedValue(mockFetchResponse);
        const superJson = new SuperJson({
          profiles: {
            'test-profile': {
              version: '1.0.0',
              defaults: {},
              providers: {
                test: {
                  file: 'file://some/file',
                },
              },
            },
          },
          providers: {},
        });

        fileSystem.path.resolve = jest
          .fn()
          .mockReturnValue('file://some/path/to');

        fileSystem.readFile = jest
          .fn()
          .mockResolvedValueOnce(ok(JSON.stringify(mockProfileDocument)))
          .mockResolvedValueOnce(ok(JSON.stringify(mockMapDocument)))
          .mockRejectedValueOnce(err('denied!'));

        mocked(fetchProviderInfo).mockRejectedValue('denied!');

        const mockProfileProvider = new ProfileProvider(
          superJson,
          'test-profile',
          mockProviderConfiguration,
          mockConfig,
          new Events(timers),
          fileSystem,
          crypto,
          new NodeFetch(timers)
        );

        await expect(() => mockProfileProvider.bind()).rejects.toMatchObject({
          error: 'denied!',
        });
        expect(fileSystem.readFile).toHaveBeenCalledTimes(3);
      });

      it('throws error when provider is provided locally but map is not', async () => {
        const superJson = new SuperJson({
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
              file: 'file://some/file',
            },
          },
        });

        fileSystem.readFile = jest
          .fn()
          .mockResolvedValueOnce(ok(JSON.stringify(mockProfileDocument)))
          .mockResolvedValueOnce(ok(JSON.stringify(mockProviderJson)));

        mocked(fetchProviderInfo).mockResolvedValue(mockProviderJson);

        const mockProfileProvider = new ProfileProvider(
          superJson,
          'test-profile',
          mockProviderConfiguration,
          mockConfig,
          new Events(timers),
          fileSystem,
          crypto,
          new NodeFetch(timers)
        );

        await expect(() => mockProfileProvider.bind()).rejects.toThrow(
          localProviderAndRemoteMapError(
            mockProviderJson.name,
            mockProfileDocument.header.name
          )
        );
      });

      it('throws error without profile provider settings', async () => {
        mocked(fetchBind).mockResolvedValue(mockFetchResponse);
        const superJson = new SuperJson({
          profiles: {
            'test-profile': {
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
        });

        mocked(fileSystem.readFile)
          .mockResolvedValueOnce(ok(JSON.stringify(mockProfileDocument)))
          .mockResolvedValueOnce(ok(JSON.stringify(mockProviderJson)))
          .mockResolvedValueOnce(ok(JSON.stringify(mockMapDocument)));

        const mockProfileProvider = new ProfileProvider(
          superJson,
          'test-profile',
          mockProviderConfiguration,
          mockConfig,
          new Events(timers),
          fileSystem,
          crypto,
          new NodeFetch(timers)
        );
        const result = await mockProfileProvider.bind();

        expect(result).toMatchObject(expectedBoundProfileProvider);
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
        mocked(fetchBind).mockResolvedValue(mockFetchResponse);

        const superJson = new SuperJson({
          profiles: {
            'test-profile': {
              version: '1.0.0',
              defaults: {},
              providers: {},
            },
          },
          providers: {
            test: {
              security: [],
            },
          },
        });
        const mockProfileProvider = new ProfileProvider(
          superJson,
          mockProfileDocument,
          mockProviderConfiguration,
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
        const superJson = new SuperJson({
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
              security: [
                {
                  username: 'test-username',
                  id: 'made-up-id',
                  password: 'test-password',
                },
              ],
            },
          },
        } as any);
        mocked(fetchBind).mockResolvedValue(mockFetchResponse);

        const mockProfileProvider = new ProfileProvider(
          superJson,
          mockProfileDocument,
          'test',
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
        const superJson = new SuperJson({
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
              security: [
                {
                  id: 'api',
                  password: 'test-password',
                },
              ],
            },
          },
        } as any);

        mocked(fetchBind).mockResolvedValue(mockFetchResponse);

        const mockProfileProvider = new ProfileProvider(
          superJson,
          mockProfileDocument,
          'test',
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
        const superJson = new SuperJson({
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
              security: [
                {
                  id: 'basic',
                  password: 'test-password',
                },
              ],
            },
          },
        } as any);

        mocked(fetchBind).mockResolvedValue(mockFetchResponse);

        const mockProfileProvider = new ProfileProvider(
          superJson,
          mockProfileDocument,
          'test',
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
        const superJson = new SuperJson({
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
              security: [
                {
                  id: 'bearer',
                  password: 'test-password',
                },
              ],
            },
          },
        } as any);

        mocked(fetchBind).mockResolvedValue(mockFetchResponse);

        const mockProfileProvider = new ProfileProvider(
          superJson,
          mockProfileDocument,
          'test',
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
        const superJson = new SuperJson({
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
              security: [
                {
                  id: 'digest',
                  password: 'test-password',
                },
              ],
            },
          },
        } as any);

        mocked(fetchBind).mockResolvedValue(mockFetchResponse);

        const mockProfileProvider = new ProfileProvider(
          superJson,
          mockProfileDocument,
          'test',
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
        mocked(fetchBind).mockResolvedValue(mockFetchResponse);
        const superJson = new SuperJson({
          profiles: {
            'test-profile': {
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
        });

        mocked(fileSystem.readFile)
          .mockResolvedValueOnce(ok(JSON.stringify(mockProfileDocument)))
          .mockResolvedValueOnce(ok(JSON.stringify(mockProviderJson)))
          .mockResolvedValueOnce(ok(JSON.stringify(mockMapDocument)));

        const providerConfiguration = new ProviderConfiguration(
          'test-boop',
          []
        );

        const mockProfileProvider = new ProfileProvider(
          superJson,
          'test-profile',
          providerConfiguration,
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
        mocked(fetchBind).mockResolvedValue(mockFetchResponse);

        const superJson = new SuperJson({
          profiles: {
            'test-profile': {
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
            test: {
              file: 'file://some/provider/file',
              security: [],
            },
          },
        });

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
          .mockResolvedValueOnce(ok(JSON.stringify(mockProfileDocument)))
          .mockResolvedValueOnce(ok(JSON.stringify(mockProviderJson)))
          .mockResolvedValueOnce(ok(JSON.stringify(mockMapDocumentBoop)));

        const mockProfileProvider = new ProfileProvider(
          superJson,
          'test-profile',
          mockProviderConfiguration,
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
