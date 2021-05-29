import { MapDocumentNode, ProfileDocumentNode } from '@superfaceai/ast';
import { promises as fsp } from 'fs';
import { mocked } from 'ts-jest/utils';

import { MapInterpreter } from '../internal/interpreter/map-interpreter';
import { MapASTError } from '../internal/interpreter/map-interpreter.errors';
import { ProfileParameterValidator } from '../internal/interpreter/profile-parameter-validator';
import {
  InputValidationError,
  ResultValidationError,
} from '../internal/interpreter/profile-parameter-validator.errors';
import {
  ApiKeyPlacement,
  HttpScheme,
  ProviderJson,
  SecurityType,
} from '../internal/providerjson';
import { SecurityValues, SuperJson } from '../internal/superjson';
import { err, ok } from '../lib';
import { ProfileConfiguration } from './profile';
import { BoundProfileProvider, ProfileProvider } from './profile-provider';
import { ProviderConfiguration } from './provider';
import { fetchBind } from './registry';

//Mock ProfileParameterValidator
jest.mock('../internal/interpreter/profile-parameter-validator');

//Mock interpreter
jest.mock('../internal/interpreter/map-interpreter');

//Mock registry
jest.mock('./registry');

//Mock fs
jest.mock('fs', () => ({
  ...jest.requireActual<Record<string, unknown>>('fs'),
  promises: {
    readFile: jest.fn(),
  },
}));

//Mock super json
jest.mock('../internal/superjson');

const mockResolvePath = jest.fn();
jest.mock('../internal/superjson', () => ({
  ...jest.requireActual<Record<string, unknown>>('../internal/superjson'),
  SuperJson: jest.fn().mockImplementation(() => {
    return { resolvePath: mockResolvePath };
  }),
}));

describe('profile provider', () => {
  const mockMapDocument: MapDocumentNode = {
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
      provider: 'test-profile',
    },
    definitions: [],
  };

  const mockProfileDocument: ProfileDocumentNode = {
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

  const mockProviderConfiguration: ProviderConfiguration = new ProviderConfiguration(
    'test',
    [
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
        digest: 'test-digest-token',
      },
    ]
  );

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
          {
            baseUrl: 'test/url',
            security: [],
            profileProviderSettings: {
              defaults: {
                test: {
                  input: { t: 't' },
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
          mockProviderConfiguration
        );

        const result = await mockProfileProvider.bind();

        expect(result.toString()).toEqual(
          new BoundProfileProvider(mockProfileDocument, mockMapDocument, {
            baseUrl: 'service/base/url',
            profileProviderSettings: undefined,
            security: [
              {
                type: SecurityType.HTTP,
                id: 'test',
                scheme: HttpScheme.BASIC,
                username: 'test-username',
                password: 'test-password',
              },
            ],
          }).toString()
        );
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
          mockProviderConfiguration
        );

        const result = await mockProfileProvider.bind();

        expect(result.toString()).toEqual(
          new BoundProfileProvider(mockProfileDocument, mockMapDocument, {
            baseUrl: 'service/base/url',
            profileProviderSettings: undefined,
            security: [
              {
                type: SecurityType.HTTP,
                id: 'test',
                scheme: HttpScheme.BASIC,
                username: 'test-username',
                password: 'test-password',
              },
            ],
          }).toString()
        );
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
          mockProviderConfiguration
        );

        const result = await mockProfileProvider.bind();

        expect(result.toString()).toEqual(
          new BoundProfileProvider(mockProfileDocument, mockMapDocument, {
            baseUrl: 'service/base/url',
            profileProviderSettings: undefined,
            security: [
              {
                type: SecurityType.HTTP,
                id: 'test',
                scheme: HttpScheme.BASIC,
                username: 'test-username',
                password: 'test-password',
              },
            ],
          }).toString()
        );
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
          mockProviderConfiguration
        );

        const result = await mockProfileProvider.bind();

        expect(result.toString()).toEqual(
          new BoundProfileProvider(mockProfileDocument, mockMapDocument, {
            baseUrl: 'service/base/url',
            profileProviderSettings: undefined,
            security: [
              {
                type: SecurityType.HTTP,
                id: 'test',
                scheme: HttpScheme.BASIC,
                username: 'test-username',
                password: 'test-password',
              },
            ],
          }).toString()
        );
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
                  test: {},
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
          mockProviderConfiguration
        );

        const result = await mockProfileProvider.bind();

        expect(result.toString()).toEqual(
          new BoundProfileProvider(mockProfileDocument, mockMapDocument, {
            baseUrl: 'service/base/url',
            profileProviderSettings: undefined,
            security: [
              {
                type: SecurityType.HTTP,
                id: 'test',
                scheme: HttpScheme.BASIC,
                username: 'test-username',
                password: 'test-password',
              },
            ],
          }).toString()
        );
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
          mockProviderConfiguration
        );
        await expect(mockProfileProvider.bind()).rejects.toThrow(
          'Hint: Profiles can be installed using the superface cli tool: `superface install --help` for more info'
        );
      });

      it('throws error when map is provided localy but provider is not', async () => {
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
          .mockResolvedValueOnce(JSON.stringify(mockProviderJson))
          .mockResolvedValueOnce(JSON.stringify(mockMapDocument));

        const mockProfileProvider = new ProfileProvider(
          mockSuperJson,
          'test-profile',
          mockProviderConfiguration
        );
        await expect(mockProfileProvider.bind()).rejects.toEqual(
          'NOT IMPLEMENTED: map provided locally but provider is not'
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
          mockProviderConfiguration
        );
        const result = await mockProfileProvider.bind();

        expect(result.toString()).toEqual(
          new BoundProfileProvider(mockProfileDocument, mockMapDocument, {
            baseUrl: 'service/base/url',
            profileProviderSettings: undefined,
            security: [
              {
                type: SecurityType.HTTP,
                id: 'test',
                scheme: HttpScheme.BASIC,
                username: 'test-username',
                password: 'test-password',
              },
            ],
          }).toString()
        );
      });

      it('returns new BoundProfileProvider with merged security', async () => {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        const orginalMerge = SuperJson.mergeSecurity;

        SuperJson.mergeSecurity = (
          _left: SecurityValues[],
          _right: SecurityValues[]
        ) => [
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
            digest: 'test-digest-token',
          },
        ];
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
          mockProviderConfiguration
        );

        const result = await mockProfileProvider.bind({ security: [] });

        expect(result.toString()).toEqual(
          new BoundProfileProvider(mockProfileDocument, mockMapDocument, {
            baseUrl: 'service/base/url',
            profileProviderSettings: undefined,
            security: [
              {
                type: SecurityType.HTTP,
                id: 'test',
                scheme: HttpScheme.BASIC,
                username: 'test-username',
                password: 'test-password',
              },
            ],
          }).toString()
        );
        SuperJson.mergeSecurity = orginalMerge;
      });

      it('throws error when could not find scheme', async () => {
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
          mockProviderJson
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
                providers: {},
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
          mockProviderJson
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
                providers: {},
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
          mockProviderJson
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
                providers: {},
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
          mockProviderJson
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
                providers: {},
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
          },
        });

        mocked(fetchBind).mockResolvedValue(mockFetchResponse);

        const mockProfileProvider = new ProfileProvider(
          mockSuperJson,
          mockProfileDocument,
          mockProviderJson
        );

        await expect(mockProfileProvider.bind()).rejects.toThrow(
          `The provided security values with id "digest" have keys: password
but http scheme requires: digest`
        );
      });
    });
  });
});
