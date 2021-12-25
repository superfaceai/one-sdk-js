import {
  ApiKeyPlacement,
  AstMetadata,
  HttpScheme,
  MapDocumentNode,
  OnFail,
  ProfileDocumentNode,
  ProviderJson,
  SecurityType,
} from '@superfaceai/ast';
import { promises as fsp } from 'fs';
import { mocked } from 'ts-jest/utils';

import { localProviderAndRemoteMapError } from '../internal/errors.helpers';
import { MapInterpreter } from '../internal/interpreter/map-interpreter';
import { MapASTError } from '../internal/interpreter/map-interpreter.errors';
import { ProfileParameterValidator } from '../internal/interpreter/profile-parameter-validator';
import {
  InputValidationError,
  ResultValidationError,
} from '../internal/interpreter/profile-parameter-validator.errors';
import { Parser } from '../internal/parser';
import { SuperJson } from '../internal/superjson';
import * as SuperJsonMutate from '../internal/superjson/mutate';
import { err, ok } from '../lib';
import { SuperfaceClient } from './client';
import { ProfileConfiguration } from './profile';
import { BoundProfileProvider, ProfileProvider } from './profile-provider';
import { ProviderConfiguration } from './provider';
import { fetchBind, fetchMapSource, fetchProviderInfo } from './registry';

//Mock ProfileParameterValidator
jest.mock('../internal/interpreter/profile-parameter-validator');

//Mock interpreter
jest.mock('../internal/interpreter/map-interpreter');

//Mock registry
jest.mock('./registry');

//Mock parser
jest.mock('../internal/parser');

//Mock fs
jest.mock('fs', () => ({
  ...jest.requireActual<Record<string, unknown>>('fs'),
  promises: {
    readFile: jest.fn(),
  },
}));

//MockClient
jest.mock('./client');

//Mock super json
const mockResolvePath = jest.fn();
jest.mock('../internal/superjson', () => ({
  ...jest.requireActual<Record<string, unknown>>('../internal/superjson'),
  SuperJson: jest.fn().mockImplementation(() => {
    return { resolvePath: mockResolvePath };
  }),
}));

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
    new ProviderConfiguration('test', [
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
        username: 'test-username',
        password: 'test-password',
      },
    ]);

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('BoundProfileProvider', () => {
    describe('when performing', () => {
      it('returns correct object', async () => {
        const validateSpy = jest
          .spyOn(ProfileParameterValidator.prototype, 'validate')
          .mockReturnValue(ok(undefined));
        const performSpy = jest
          .spyOn(MapInterpreter.prototype, 'perform')
          .mockResolvedValue(ok('test'));

        const mockBoundProfileProvider = new BoundProfileProvider(
          mockProfileDocument,
          mockMapDocument,
          'test',
          { baseUrl: 'test/url', security: [] }
        );

        await expect(
          mockBoundProfileProvider.perform<undefined, string>('test-usecase')
        ).resolves.toEqual(ok('test'));

        expect(validateSpy).toHaveBeenCalledTimes(2);
        expect(validateSpy).toHaveBeenNthCalledWith(
          1,
          undefined,
          'input',
          'test-usecase'
        );
        expect(validateSpy).toHaveBeenNthCalledWith(
          2,
          'test',
          'result',
          'test-usecase'
        );

        expect(performSpy).toHaveBeenCalledTimes(1);
        expect(performSpy).toHaveBeenCalledWith(mockMapDocument);
      });

      it('returns error when input is not valid', async () => {
        const validateSpy = jest
          .spyOn(ProfileParameterValidator.prototype, 'validate')
          .mockReturnValue(err(new InputValidationError()));
        const performSpy = jest.spyOn(MapInterpreter.prototype, 'perform');

        const mockBoundProfileProvider = new BoundProfileProvider(
          mockProfileDocument,
          mockMapDocument,
          'test',
          { baseUrl: 'test/url', security: [] }
        );

        await expect(
          mockBoundProfileProvider.perform<undefined, string>('test-usecase')
        ).resolves.toEqual(err(new InputValidationError()));

        expect(validateSpy).toHaveBeenCalledTimes(1);
        expect(validateSpy).toHaveBeenCalledWith(
          undefined,
          'input',
          'test-usecase'
        );

        expect(performSpy).not.toHaveBeenCalled();
      });

      it('returns error when result is not valid', async () => {
        const validateSpy = jest
          .spyOn(ProfileParameterValidator.prototype, 'validate')
          .mockReturnValueOnce(ok(undefined))
          .mockReturnValueOnce(err(new ResultValidationError()));
        const performSpy = jest
          .spyOn(MapInterpreter.prototype, 'perform')
          .mockResolvedValue(ok('test'));

        const mockBoundProfileProvider = new BoundProfileProvider(
          mockProfileDocument,
          mockMapDocument,
          'test',
          { baseUrl: 'test/url', security: [] }
        );

        await expect(
          mockBoundProfileProvider.perform<undefined, string>('test-usecase')
        ).resolves.toEqual(err(new ResultValidationError()));

        expect(validateSpy).toHaveBeenCalledTimes(2);
        expect(validateSpy).toHaveBeenNthCalledWith(
          1,
          undefined,
          'input',
          'test-usecase'
        );
        expect(validateSpy).toHaveBeenNthCalledWith(
          2,
          'test',
          'result',
          'test-usecase'
        );

        expect(performSpy).toHaveBeenCalledTimes(1);
        expect(performSpy).toHaveBeenCalledWith(mockMapDocument);
      });

      it('returns error when there is an error during interpreter perform', async () => {
        const validateSpy = jest
          .spyOn(ProfileParameterValidator.prototype, 'validate')
          .mockReturnValue(ok(undefined));
        const performSpy = jest
          .spyOn(MapInterpreter.prototype, 'perform')
          .mockResolvedValue(err(new MapASTError('test-error')));

        const mockBoundProfileProvider = new BoundProfileProvider(
          mockProfileDocument,
          mockMapDocument,
          'test',
          {
            baseUrl: 'test/url',
            security: [],
            profileProviderSettings: {
              defaults: {
                test: {
                  input: { t: 't' },
                  retryPolicy: { kind: OnFail.NONE },
                },
              },
            },
          }
        );
        await expect(
          mockBoundProfileProvider.perform<undefined, string>('test')
        ).resolves.toEqual(err(new MapASTError('test-error')));

        expect(validateSpy).toHaveBeenCalledTimes(1);
        expect(validateSpy).toHaveBeenCalledWith({ t: 't' }, 'input', 'test');

        expect(performSpy).toHaveBeenCalledTimes(1);
        expect(performSpy).toHaveBeenCalledWith(mockMapDocument);
      });
    });
  });

  describe('ProfileProvider', () => {
    describe('when binding', () => {
      const mockSuperfacClient = new SuperfaceClient();
      const mockFetchResponse = {
        provider: mockProviderJson,
        mapAst: mockMapDocument,
      };
      const mockSuperJson = new SuperJson({
        profiles: {
          ['test-profile']: {
            version: '1.0.0',
            defaults: {},
            providers: {},
          },
        },
        providers: {},
      });
      const expectedBoundProfileProvider = {
        profileAst: mockProfileDocument,
        mapAst: mockMapDocument,
        providerName: mockProviderJson.name,
        configuration: {
          baseUrl: 'service/base/url',
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
              username: 'test-username',
              password: 'test-password',
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
        //normalized is getter on SuperJson - unable to mock or spy on
        Object.assign(mockSuperJson, {
          normalized: {
            profiles: {
              ['test-profile']: {
                version: '1.0.0',
                defaults: {},
                providers: {},
              },
            },
            providers: {
              test: {
                security: [],
                parameters: {
                  first: 'plain value',
                  second: '$TEST_SECOND', //unset env value without default
                  third: '$TEST_THIRD', //unset env value with default
                  //fourth is missing - should be resolved to its default
                },
              },
            },
          },
        });
        const mockProfileProvider = new ProfileProvider(
          mockSuperJson,
          mockProfileDocument,
          mockProviderConfiguration,
          mockSuperfacClient
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
        //normalized is getter on SuperJson - unable to mock or spy on
        Object.assign(mockSuperJson, {
          normalized: {
            profiles: {
              ['test-profile']: {
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
          },
        });
        const mockProfileProvider = new ProfileProvider(
          mockSuperJson,
          mockProfileDocument,
          mockProviderConfiguration,
          mockSuperfacClient
        );

        const result = await mockProfileProvider.bind();

        expect(result).toMatchObject(expectedBoundProfileProvider);
      });

      it('returns new BoundProfileProvider use profile id', async () => {
        mocked(fetchBind).mockResolvedValue(mockFetchResponse);
        //normalized is getter on SuperJson - unable to mock or spy on
        Object.assign(mockSuperJson, {
          normalized: {
            profiles: {
              ['test-profile']: {
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
          },
        });

        mocked(mockResolvePath).mockReturnValue('file://some/path/to');

        jest
          .spyOn(fsp, 'readFile')
          .mockResolvedValue(JSON.stringify(mockProfileDocument));

        const mockProfileProvider = new ProfileProvider(
          mockSuperJson,
          'test-profile',
          mockProviderConfiguration,
          mockSuperfacClient
        );

        const result = await mockProfileProvider.bind();

        expect(result).toMatchObject(expectedBoundProfileProvider);
      });

      it('returns new BoundProfileProvider use profile configuration', async () => {
        mocked(fetchBind).mockResolvedValue(mockFetchResponse);
        //normalized is getter on SuperJson - unable to mock or spy on
        Object.assign(mockSuperJson, {
          normalized: {
            profiles: {
              ['test-profile']: {
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
          },
        });

        mocked(mockResolvePath).mockReturnValue('file://some/path/to');

        jest
          .spyOn(fsp, 'readFile')
          .mockResolvedValue(JSON.stringify(mockProfileDocument));

        const mockProfileProvider = new ProfileProvider(
          mockSuperJson,
          new ProfileConfiguration('test-profile', '1.0.0'),
          mockProviderConfiguration,
          mockSuperfacClient
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
        //normalized is getter on SuperJson - unable to mock or spy on
        Object.assign(mockSuperJson, {
          normalized: {
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
        });

        mocked(fetchMapSource).mockResolvedValue(mockMapSource);

        jest
          .spyOn(Parser, 'parseMap')
          .mockResolvedValue(mockFetchResponse.mapAst);

        mocked(mockResolvePath).mockReturnValue('file://some/path/to');

        jest
          .spyOn(fsp, 'readFile')
          .mockResolvedValue(JSON.stringify(mockProfileDocument));

        const mockProfileProvider = new ProfileProvider(
          mockSuperJson,
          new ProfileConfiguration('test-profile', '1.0.0'),
          mockProviderConfiguration,
          mockSuperfacClient
        );

        const result = await mockProfileProvider.bind();

        expect(result).toMatchObject(expectedBoundProfileProvider);
      });

      it('returns new BoundProfileProvider load localy', async () => {
        mocked(fetchBind).mockResolvedValue(mockFetchResponse);
        //normalized is getter on SuperJson - unable to mock or spy on
        Object.assign(mockSuperJson, {
          normalized: {
            profiles: {
              ['test-profile']: {
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
                security: [],
              },
            },
          },
        });

        mocked(mockResolvePath).mockReturnValue('file://some/path/to');

        jest
          .spyOn(fsp, 'readFile')
          .mockResolvedValueOnce(JSON.stringify(mockProfileDocument))
          .mockResolvedValueOnce(JSON.stringify(mockProviderJson))
          .mockResolvedValueOnce(JSON.stringify(mockMapDocument));

        const mockProfileProvider = new ProfileProvider(
          mockSuperJson,
          'test-profile',
          mockProviderConfiguration,
          mockSuperfacClient
        );

        const result = await mockProfileProvider.bind();

        expect(result).toMatchObject(expectedBoundProfileProvider);
      });

      it('returns new BoundProfileProvider load localy and use map variant', async () => {
        mocked(fetchBind).mockResolvedValue(mockFetchResponse);
        //normalized is getter on SuperJson - unable to mock or spy on
        Object.assign(mockSuperJson, {
          normalized: {
            profiles: {
              ['test-profile']: {
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
                security: [],
              },
            },
          },
        });

        mocked(mockResolvePath).mockReturnValue('file://some/path/to');

        jest
          .spyOn(fsp, 'readFile')
          .mockResolvedValueOnce(JSON.stringify(mockProfileDocument))
          .mockResolvedValueOnce(JSON.stringify(mockProviderJson))
          .mockResolvedValueOnce(JSON.stringify(mockMapDocument));

        const mockProfileProvider = new ProfileProvider(
          mockSuperJson,
          'test-profile',
          mockProviderConfiguration,
          mockSuperfacClient
        );

        const result = await mockProfileProvider.bind();

        expect(result).toMatchObject(expectedBoundProfileProvider);
      });

      it('throws error without profile settings', async () => {
        mocked(fetchBind).mockResolvedValue(mockFetchResponse);
        //normalized is getter on SuperJson - unable to mock or spy on
        Object.assign(mockSuperJson, {
          normalized: {
            profiles: {},
            providers: {
              test: {
                file: 'file://some/file',
                security: [],
              },
            },
          },
        });

        mocked(mockResolvePath).mockReturnValue('file://some/path/to');

        jest
          .spyOn(fsp, 'readFile')
          .mockResolvedValueOnce(JSON.stringify(mockProfileDocument))
          .mockResolvedValueOnce(JSON.stringify(mockProviderJson))
          .mockResolvedValueOnce(JSON.stringify(mockMapDocument));

        const mockProfileProvider = new ProfileProvider(
          mockSuperJson,
          'test-profile',
          'test',
          mockSuperfacClient
        );
        await expect(mockProfileProvider.bind()).rejects.toThrow(
          'Hint: Profiles can be installed using the superface cli tool: `superface install --help` for more info'
        );
      });

      it('returns new BoundProfileProvider when map is provided locally but provider is not', async () => {
        mocked(fetchBind).mockResolvedValue(mockFetchResponse);
        //normalized is getter on SuperJson - unable to mock or spy on
        Object.assign(mockSuperJson, {
          normalized: {
            profiles: {
              ['test-profile']: {
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
          },
        });

        mocked(mockResolvePath).mockReturnValue('file://some/path/to');

        jest
          .spyOn(fsp, 'readFile')
          .mockResolvedValueOnce(JSON.stringify(mockProfileDocument))
          .mockResolvedValueOnce(JSON.stringify(mockMapDocument));

        mocked(fetchProviderInfo).mockResolvedValue(mockProviderJson);

        const mockProfileProvider = new ProfileProvider(
          mockSuperJson,
          'test-profile',
          mockProviderConfiguration,
          mockSuperfacClient
        );
        const result = await mockProfileProvider.bind();

        expect(result).toMatchObject(expectedBoundProfileProvider);
      });

      it('throws error when provider is provided locally but map is not', async () => {
        //normalized is getter on SuperJson - unable to mock or spy on
        Object.assign(mockSuperJson, {
          normalized: {
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
        });

        mocked(mockResolvePath).mockReturnValue('file://some/path/to');

        jest
          .spyOn(fsp, 'readFile')
          .mockResolvedValueOnce(JSON.stringify(mockProfileDocument))
          .mockResolvedValueOnce(JSON.stringify(mockProviderJson));

        mocked(fetchProviderInfo).mockResolvedValue(mockProviderJson);

        const mockProfileProvider = new ProfileProvider(
          mockSuperJson,
          'test-profile',
          mockProviderConfiguration,
          mockSuperfacClient
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
        //normalized is getter on SuperJson - unable to mock or spy on
        Object.assign(mockSuperJson, {
          normalized: {
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
                security: [],
              },
            },
          },
        });

        mocked(mockResolvePath).mockReturnValue('file://some/path/to');

        jest
          .spyOn(fsp, 'readFile')
          .mockResolvedValueOnce(JSON.stringify(mockProfileDocument))
          .mockResolvedValueOnce(JSON.stringify(mockProviderJson))
          .mockResolvedValueOnce(JSON.stringify(mockMapDocument));

        const mockProfileProvider = new ProfileProvider(
          mockSuperJson,
          'test-profile',
          mockProviderConfiguration,
          mockSuperfacClient
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
            username: 'test-username',
            password: 'test-password',
          },
        ]);
        mocked(fetchBind).mockResolvedValue(mockFetchResponse);

        //normalized is getter on SuperJson - unable to mock or spy on
        Object.assign(mockSuperJson, {
          normalized: {
            profiles: {
              ['test-profile']: {
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
          },
        });
        const mockProfileProvider = new ProfileProvider(
          mockSuperJson,
          mockProfileDocument,
          mockProviderConfiguration,
          mockSuperfacClient
        );

        const result = await mockProfileProvider.bind({ security: [] });

        expect(result).toMatchObject(expectedBoundProfileProvider);
        mergeSecuritySpy.mockRestore();
      });

      it('throws error when could not find scheme', async () => {
        //normalized is getter on SuperJson - unable to mock or spy on
        Object.assign(mockSuperJson, {
          normalized: {
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
          },
        });

        mocked(fetchBind).mockResolvedValue(mockFetchResponse);

        const mockProfileProvider = new ProfileProvider(
          mockSuperJson,
          mockProfileDocument,
          'test',
          mockSuperfacClient
        );

        await expect(mockProfileProvider.bind()).rejects.toThrow(
          `The provider definition for "test" defines these security schemes: basic, api, bearer, digest
but a secret value was provided for security scheme: made-up-id`
        );
      });

      it('throws error on invalid api key scheme', async () => {
        //normalized is getter on SuperJson - unable to mock or spy on
        Object.assign(mockSuperJson, {
          normalized: {
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
          },
        });

        mocked(fetchBind).mockResolvedValue(mockFetchResponse);

        const mockProfileProvider = new ProfileProvider(
          mockSuperJson,
          mockProfileDocument,
          'test',
          mockSuperfacClient
        );

        await expect(mockProfileProvider.bind()).rejects.toThrow(
          `The provided security values with id "api" have keys: password
but apiKey scheme requires: apikey`
        );
      });

      it('throws error on invalid basic auth scheme', async () => {
        //normalized is getter on SuperJson - unable to mock or spy on
        Object.assign(mockSuperJson, {
          normalized: {
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
          },
        });

        mocked(fetchBind).mockResolvedValue(mockFetchResponse);

        const mockProfileProvider = new ProfileProvider(
          mockSuperJson,
          mockProfileDocument,
          'test',
          mockSuperfacClient
        );

        await expect(mockProfileProvider.bind()).rejects.toThrow(
          `The provided security values with id "basic" have keys: password
but http scheme requires: username, password`
        );
      });

      it('throws error on invalid bearer auth scheme', async () => {
        //normalized is getter on SuperJson - unable to mock or spy on
        Object.assign(mockSuperJson, {
          normalized: {
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
          },
        });

        mocked(fetchBind).mockResolvedValue(mockFetchResponse);

        const mockProfileProvider = new ProfileProvider(
          mockSuperJson,
          mockProfileDocument,
          'test',
          mockSuperfacClient
        );

        await expect(mockProfileProvider.bind()).rejects.toThrow(
          `The provided security values with id "bearer" have keys: password
but http scheme requires: token`
        );
      });

      it('throws error on invalid digest auth scheme', async () => {
        //normalized is getter on SuperJson - unable to mock or spy on
        Object.assign(mockSuperJson, {
          normalized: {
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
                    digest: 'test-password',
                  },
                ],
              },
            },
          },
        });

        mocked(fetchBind).mockResolvedValue(mockFetchResponse);

        const mockProfileProvider = new ProfileProvider(
          mockSuperJson,
          mockProfileDocument,
          'test',
          mockSuperfacClient
        );

        await expect(mockProfileProvider.bind()).rejects.toThrow(
          `The provided security values with id "digest" have keys: digest
but http scheme requires: username, password`
        );
      });

      it('throws when super.json and provider.json provider names do not match', async () => {
        mocked(fetchBind).mockResolvedValue(mockFetchResponse);
        // normalized is getter on SuperJson - unable to mock or spy on
        Object.assign(mockSuperJson, {
          normalized: {
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
        });

        mocked(mockResolvePath).mockReturnValue('file://some/path/to');

        jest
          .spyOn(fsp, 'readFile')
          .mockResolvedValueOnce(JSON.stringify(mockProfileDocument))
          .mockResolvedValueOnce(JSON.stringify(mockProviderJson))
          .mockResolvedValueOnce(JSON.stringify(mockMapDocument));

        const providerConfiguration = new ProviderConfiguration(
          'test-boop',
          []
        );

        const mockProfileProvider = new ProfileProvider(
          mockSuperJson,
          'test-profile',
          providerConfiguration,
          mockSuperfacClient
        );

        await expect(mockProfileProvider.bind()).rejects.toThrow(
          'Provider name in provider.json does not match provider name in configuration'
        );
      });

      it('throws when super.json and map provider names do not match', async () => {
        mocked(fetchBind).mockResolvedValue(mockFetchResponse);
        // normalized is getter on SuperJson - unable to mock or spy on
        Object.assign(mockSuperJson, {
          normalized: {
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
              test: {
                file: 'file://some/provider/file',
                security: [],
              },
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

        mocked(mockResolvePath).mockReturnValue('file://some/path/to');

        jest
          .spyOn(fsp, 'readFile')
          .mockResolvedValueOnce(JSON.stringify(mockProfileDocument))
          .mockResolvedValueOnce(JSON.stringify(mockProviderJson))
          .mockResolvedValueOnce(JSON.stringify(mockMapDocumentBoop));

        const mockProfileProvider = new ProfileProvider(
          mockSuperJson,
          'test-profile',
          mockProviderConfiguration,
          mockSuperfacClient
        );

        await expect(mockProfileProvider.bind()).rejects.toThrow(
          'Provider name in map does not match provider name in configuration'
        );
      });
    });
  });
});
