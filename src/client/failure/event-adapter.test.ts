import { MapDocumentNode, ProfileDocumentNode } from '@superfaceai/ast';
import { getLocal } from 'mockttp';

import { BackoffKind, OnFail, SuperJson } from '../../internal';
import { ok, sleep } from '../../lib';
import { invalidateSuperfaceClientCache, SuperfaceClient } from '../client';
import { ProfileConfiguration } from '../profile';
import { BoundProfileProvider } from '../profile-provider';
import { ProviderConfiguration } from '../provider';

const firstMockProfileDocument: ProfileDocumentNode = {
  kind: 'ProfileDocument',
  header: {
    kind: 'ProfileHeader',
    scope: 'starwars',
    name: 'character-information',
    version: {
      major: 1,
      minor: 0,
      patch: 0,
    },
  },
  definitions: [
    {
      kind: 'UseCaseDefinition',
      useCaseName: 'Test',
      safety: 'safe',
      result: {
        kind: 'UseCaseSlotDefinition',
        type: {
          kind: 'ObjectDefinition',
          fields: [
            {
              kind: 'FieldDefinition',
              fieldName: 'message',
              required: true,
              type: {
                kind: 'NonNullDefinition',
                type: {
                  kind: 'PrimitiveTypeName',
                  name: 'string',
                },
              },
            },
          ],
        },
      },
    },
    {
      kind: 'UseCaseDefinition',
      useCaseName: 'SecondUseCase',
      safety: 'safe',
      result: {
        kind: 'UseCaseSlotDefinition',
        type: {
          kind: 'ObjectDefinition',
          fields: [
            {
              kind: 'FieldDefinition',
              fieldName: 'message',
              required: true,
              type: {
                kind: 'NonNullDefinition',
                type: {
                  kind: 'PrimitiveTypeName',
                  name: 'string',
                },
              },
            },
          ],
        },
      },
    },
  ],
};

const secondMockProfiledDocument: ProfileDocumentNode = {
  kind: 'ProfileDocument',
  header: {
    kind: 'ProfileHeader',
    scope: 'startrek',
    name: 'character-information',
    version: {
      major: 1,
      minor: 0,
      patch: 0,
    },
  },
  definitions: [
    {
      kind: 'UseCaseDefinition',
      useCaseName: 'Test',
      safety: 'safe',
      result: {
        kind: 'UseCaseSlotDefinition',
        type: {
          kind: 'ObjectDefinition',
          fields: [
            {
              kind: 'FieldDefinition',
              fieldName: 'message',
              required: true,
              type: {
                kind: 'NonNullDefinition',
                type: {
                  kind: 'PrimitiveTypeName',
                  name: 'string',
                },
              },
            },
          ],
        },
      },
    },
  ],
};

const firstMockMapDocument: MapDocumentNode = {
  kind: 'MapDocument',
  header: {
    kind: 'MapHeader',
    profile: {
      scope: 'starwars',
      name: 'character-information',
      version: {
        major: 1,
        minor: 0,
        patch: 0,
      },
    },
    provider: 'provider',
  },
  definitions: [
    {
      kind: 'MapDefinition',
      name: 'Test',
      usecaseName: 'Test',
      statements: [
        {
          kind: 'HttpCallStatement',
          method: 'GET',
          url: '/first',
          request: {
            security: [],
            kind: 'HttpRequest',
          },
          responseHandlers: [
            {
              kind: 'HttpResponseHandler',
              statusCode: 200,
              contentType: 'application/json',
              statements: [
                {
                  kind: 'OutcomeStatement',
                  isError: false,
                  terminateFlow: false,
                  value: {
                    kind: 'ObjectLiteral',
                    fields: [
                      {
                        kind: 'Assignment',
                        key: ['message'],
                        value: {
                          kind: 'PrimitiveLiteral',
                          value: 'hello',
                        },
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    {
      kind: 'MapDefinition',
      name: 'SecondUseCase',
      usecaseName: 'SecondUseCase',
      statements: [
        {
          kind: 'HttpCallStatement',
          method: 'GET',
          url: '/first',
          request: {
            security: [],
            kind: 'HttpRequest',
          },
          responseHandlers: [
            {
              kind: 'HttpResponseHandler',
              statusCode: 200,
              contentType: 'application/json',
              statements: [
                {
                  kind: 'OutcomeStatement',
                  isError: false,
                  terminateFlow: false,
                  value: {
                    kind: 'ObjectLiteral',
                    fields: [
                      {
                        kind: 'Assignment',
                        key: ['message'],
                        value: {
                          kind: 'PrimitiveLiteral',
                          value: 'hello from first provider and second usecase',
                        },
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const secondMockMapDocument: MapDocumentNode = {
  kind: 'MapDocument',
  header: {
    kind: 'MapHeader',
    profile: {
      scope: 'starwars',
      name: 'character-information',
      version: {
        major: 1,
        minor: 0,
        patch: 0,
      },
    },
    provider: 'second',
  },
  definitions: [
    {
      kind: 'MapDefinition',
      name: 'Test',
      usecaseName: 'Test',
      statements: [
        {
          kind: 'HttpCallStatement',
          method: 'GET',
          url: '/second',
          request: {
            security: [],
            kind: 'HttpRequest',
          },
          responseHandlers: [
            {
              kind: 'HttpResponseHandler',
              statusCode: 200,
              contentType: 'application/json',
              statements: [
                {
                  kind: 'OutcomeStatement',
                  isError: false,
                  terminateFlow: false,
                  value: {
                    kind: 'ObjectLiteral',
                    fields: [
                      {
                        kind: 'Assignment',
                        key: ['message'],
                        value: {
                          kind: 'PrimitiveLiteral',
                          value: 'hello from second provider',
                        },
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    {
      kind: 'MapDefinition',
      name: 'SecondUseCase',
      usecaseName: 'SecondUseCase',
      statements: [
        {
          kind: 'HttpCallStatement',
          method: 'GET',
          url: '/second',
          request: {
            security: [],
            kind: 'HttpRequest',
          },
          responseHandlers: [
            {
              kind: 'HttpResponseHandler',
              statusCode: 200,
              contentType: 'application/json',
              statements: [
                {
                  kind: 'OutcomeStatement',
                  isError: false,
                  terminateFlow: false,
                  value: {
                    kind: 'ObjectLiteral',
                    fields: [
                      {
                        kind: 'Assignment',
                        key: ['message'],
                        value: {
                          kind: 'PrimitiveLiteral',
                          value:
                            'hello from second provider and second usecase',
                        },
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const thirdMockMapDocument: MapDocumentNode = {
  kind: 'MapDocument',
  header: {
    kind: 'MapHeader',
    profile: {
      scope: 'startrek',
      name: 'character-information',
      version: {
        major: 1,
        minor: 0,
        patch: 0,
      },
    },
    provider: 'third',
  },
  definitions: [
    {
      kind: 'MapDefinition',
      name: 'Test',
      usecaseName: 'Test',
      statements: [
        {
          kind: 'HttpCallStatement',
          method: 'GET',
          url: '/third',
          request: {
            security: [],
            kind: 'HttpRequest',
          },
          responseHandlers: [
            {
              kind: 'HttpResponseHandler',
              statusCode: 200,
              contentType: 'application/json',
              statements: [
                {
                  kind: 'OutcomeStatement',
                  isError: false,
                  terminateFlow: false,
                  value: {
                    kind: 'ObjectLiteral',
                    fields: [
                      {
                        kind: 'Assignment',
                        key: ['message'],
                        value: {
                          kind: 'PrimitiveLiteral',
                          value: 'hello from third provider',
                        },
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const mockServer = getLocal();

describe('event-adapter', () => {
  beforeEach(async () => {
    await mockServer.start();
  });

  afterEach(async () => {
    await mockServer.stop();
    invalidateSuperfaceClientCache();
  });

  //Without retry policy
  it('does not use retry policy - returns after HTTP 200', async () => {
    const mockLoadSync = jest.fn();

    const endpoint = await mockServer.get('/first').thenJson(200, {});

    const mockSuperJson = new SuperJson({
      profiles: {
        ['starwars/character-information']: {
          version: '1.0.0',
          providers: {
            provider: {},
          },
        },
      },
      providers: {
        provider: {
          security: [],
        },
      },
    });

    mockLoadSync.mockReturnValue(ok(mockSuperJson));
    SuperJson.loadSync = mockLoadSync;

    //Not mocked client
    const client = new SuperfaceClient();

    //Mocking bounded provider
    const mockBoundProfileProvider = new BoundProfileProvider(
      firstMockProfileDocument,
      firstMockMapDocument,
      'provider',
      { baseUrl: mockServer.url, security: [] },
      client
    );
    //Mocking only this one function in client
    const cacheBoundProfileProviderSpy = jest
      .spyOn(client, 'cacheBoundProfileProvider')
      .mockResolvedValue(mockBoundProfileProvider);

    //Run it as usual
    const profile = await client.getProfile('starwars/character-information');
    const useCase = profile.getUseCase('Test');
    const provider = await client.getProvider('provider');
    const result = await useCase.perform(undefined, { provider });

    expect(result.isOk() && result.value).toEqual({ message: 'hello' });
    expect((await endpoint.getSeenRequests()).length).toEqual(1);
    expect(cacheBoundProfileProviderSpy).toHaveBeenCalledTimes(1);
  }, 20000);

  it('does not use retry policy - aborts after HTTP 500', async () => {
    const mockLoadSync = jest.fn();

    const endpoint = await mockServer.get('/first').thenJson(500, {});

    const mockSuperJson = new SuperJson({
      profiles: {
        ['starwars/character-information']: {
          version: '1.0.0',
          providers: {
            provider: {},
          },
        },
      },
      providers: {
        provider: {
          security: [],
        },
      },
    });

    mockLoadSync.mockReturnValue(ok(mockSuperJson));
    SuperJson.loadSync = mockLoadSync;

    const client = new SuperfaceClient();

    //Mocking bounded provider
    const mockBoundProfileProvider = new BoundProfileProvider(
      firstMockProfileDocument,
      firstMockMapDocument,
      'provider',
      { baseUrl: mockServer.url, security: [] },
      client
    );
    const cacheBoundProfileProviderSpy = jest
      .spyOn(client, 'cacheBoundProfileProvider')
      .mockResolvedValue(mockBoundProfileProvider);

    const profile = await client.getProfile('starwars/character-information');
    const useCase = profile.getUseCase('Test');
    const provider = await client.getProvider('provider');
    const result = await useCase.perform(undefined, { provider });

    expect(result.isErr()).toEqual(true);
    expect((await endpoint.getSeenRequests()).length).toEqual(1);
    expect(cacheBoundProfileProviderSpy).toHaveBeenCalledTimes(1);
  }, 20000);

  it('does not use retry policy - aborts after closed connection', async () => {
    const mockLoadSync = jest.fn();

    await mockServer.get('/first').thenCloseConnection();

    const mockSuperJson = new SuperJson({
      profiles: {
        ['starwars/character-information']: {
          version: '1.0.0',
          providers: {
            provider: {},
          },
        },
      },
      providers: {
        provider: {
          security: [],
        },
      },
    });

    mockLoadSync.mockReturnValue(ok(mockSuperJson));
    SuperJson.loadSync = mockLoadSync;

    const client = new SuperfaceClient();

    //Mocking bounded provider
    const mockBoundProfileProvider = new BoundProfileProvider(
      firstMockProfileDocument,
      firstMockMapDocument,
      'provider',
      { baseUrl: mockServer.url, security: [] },
      client
    );
    const cacheBoundProfileProviderSpy = jest
      .spyOn(client, 'cacheBoundProfileProvider')
      .mockResolvedValue(mockBoundProfileProvider);

    const profile = await client.getProfile('starwars/character-information');
    const useCase = profile.getUseCase('Test');
    const provider = await client.getProvider('provider');
    const result = await useCase.perform(undefined, { provider });

    expect(result.isErr()).toEqual(true);
    expect(cacheBoundProfileProviderSpy).toHaveBeenCalledTimes(1);
  }, 20000);

  it('does not use retry policy - aborts after timeout', async () => {
    const mockLoadSync = jest.fn();

    await mockServer.get('/first').thenTimeout();

    const mockSuperJson = new SuperJson({
      profiles: {
        ['starwars/character-information']: {
          version: '1.0.0',
          providers: {
            provider: {},
          },
        },
      },
      providers: {
        provider: {
          security: [],
        },
      },
    });

    mockLoadSync.mockReturnValue(ok(mockSuperJson));
    SuperJson.loadSync = mockLoadSync;

    const client = new SuperfaceClient();

    //Mocking bounded provider
    const mockBoundProfileProvider = new BoundProfileProvider(
      firstMockProfileDocument,
      firstMockMapDocument,
      'provider',
      { baseUrl: mockServer.url, security: [] },
      client
    );
    const cacheBoundProfileProviderSpy = jest
      .spyOn(client, 'cacheBoundProfileProvider')
      .mockResolvedValue(mockBoundProfileProvider);

    const profile = await client.getProfile('starwars/character-information');
    const useCase = profile.getUseCase('Test');
    const provider = await client.getProvider('provider');
    const result = await useCase.perform(undefined, { provider });

    expect(result.isErr()).toEqual(true);
    expect(cacheBoundProfileProviderSpy).toHaveBeenCalledTimes(1);
  }, 40000);

  //Circuit breaker
  it('use circuit-breaker policy - aborts after HTTP 500', async () => {
    const mockLoadSync = jest.fn();

    const endpoint = await mockServer.get('/first').thenJson(500, {});

    const mockSuperJson = new SuperJson({
      profiles: {
        ['starwars/character-information']: {
          version: '1.0.1',
          providers: {
            provider: {
              defaults: {
                Test: {
                  input: {},
                  retryPolicy: {
                    kind: OnFail.CIRCUIT_BREAKER,
                    maxContiguousRetries: 2,
                    requestTimeout: 1000,
                  },
                },
              },
            },
          },
        },
      },
      providers: {
        provider: {
          security: [],
        },
      },
    });

    mockLoadSync.mockReturnValue(ok(mockSuperJson));
    SuperJson.loadSync = mockLoadSync;

    const client = new SuperfaceClient();

    //Mocking bounded provider
    const mockBoundProfileProvider = new BoundProfileProvider(
      firstMockProfileDocument,
      firstMockMapDocument,
      'provider',
      { baseUrl: mockServer.url, security: [] },
      client
    );
    const cacheBoundProfileProviderSpy = jest
      .spyOn(client, 'cacheBoundProfileProvider')
      .mockResolvedValue(mockBoundProfileProvider);

    const profile = await client.getProfile('starwars/character-information');
    const useCase = profile.getUseCase('Test');
    const provider = await client.getProvider('provider');
    const result = await useCase.perform(undefined, { provider });

    expect(result.isErr() && result.error.message).toContain(
      'Circuit breaker is open'
    );

    //We send request twice
    expect((await endpoint.getSeenRequests()).length).toEqual(2);
    expect(cacheBoundProfileProviderSpy).toHaveBeenCalledTimes(1);
  }, 20000);

  it('use circuit-breaker policy with backoff - aborts after HTTP 500', async () => {
    const mockLoadSync = jest.fn();
    const backoffTime = 5000;
    let firstRequestTime: number | undefined;
    let secondRequestTime: number | undefined;

    let retry = true;
    const endpoint = await mockServer.get('/first').thenCallback(() => {
      if (retry) {
        retry = false;
        firstRequestTime = Date.now();

        return {
          statusCode: 500,
          json: {},
        };
      }
      secondRequestTime = Date.now();

      return {
        statusCode: 200,
        json: {},
      };
    });

    const mockSuperJson = new SuperJson({
      profiles: {
        ['starwars/character-information']: {
          version: '1.0.1',
          providers: {
            provider: {
              defaults: {
                Test: {
                  input: {},
                  retryPolicy: {
                    kind: OnFail.CIRCUIT_BREAKER,
                    maxContiguousRetries: 5,
                    requestTimeout: 1000,
                    backoff: {
                      kind: BackoffKind.EXPONENTIAL,
                      start: backoffTime,
                    },
                  },
                },
              },
            },
          },
        },
      },
      providers: {
        provider: {
          security: [],
        },
      },
    });

    mockLoadSync.mockReturnValue(ok(mockSuperJson));
    SuperJson.loadSync = mockLoadSync;

    const client = new SuperfaceClient();

    //Mocking bounded provider
    const mockBoundProfileProvider = new BoundProfileProvider(
      firstMockProfileDocument,
      firstMockMapDocument,
      'provider',
      { baseUrl: mockServer.url, security: [] },
      client
    );
    const cacheBoundProfileProviderSpy = jest
      .spyOn(client, 'cacheBoundProfileProvider')
      .mockResolvedValue(mockBoundProfileProvider);

    const profile = await client.getProfile('starwars/character-information');
    const useCase = profile.getUseCase('Test');
    const provider = await client.getProvider('provider');
    const result = await useCase.perform(undefined, { provider });

    expect(result.isOk() && result.value).toEqual({ message: 'hello' });

    //We waited because of backoff
    expect(secondRequestTime).toBeDefined();
    expect(firstRequestTime).toBeDefined();
    //Two is default exponent for ExponentialBackoff
    expect(secondRequestTime! - firstRequestTime!).toBeGreaterThanOrEqual(
      2 * backoffTime
    );
    //We send request twice
    expect((await endpoint.getSeenRequests()).length).toEqual(2);
    expect(cacheBoundProfileProviderSpy).toHaveBeenCalledTimes(1);
  }, 20000);

  it('use circuit-breaker policy - switch providers after HTTP 500, using default provider', async () => {
    const mockLoadSync = jest.fn();

    const endpoint = await mockServer.get('/first').thenJson(500, {});
    const secondEndpoint = await mockServer.get('/second').thenJson(200, {});

    const mockSuperJson = new SuperJson({
      profiles: {
        ['starwars/character-information']: {
          version: '1.0.0',
          defaults: {
            Test: {
              providerFailover: true,
            },
          },
          priority: ['provider', 'second'],
          providers: {
            provider: {
              defaults: {
                Test: {
                  input: {},
                  retryPolicy: {
                    kind: OnFail.CIRCUIT_BREAKER,
                    maxContiguousRetries: 2,
                    requestTimeout: 1000,
                  },
                },
              },
            },
            second: {},
          },
        },
      },
      providers: {
        provider: {
          security: [],
        },
        second: {
          security: [],
        },
      },
    });

    mockLoadSync.mockReturnValue(ok(mockSuperJson));
    SuperJson.loadSync = mockLoadSync;

    const client = new SuperfaceClient();

    //Mocking first bounded provider
    const firstMockBoundProfileProvider = new BoundProfileProvider(
      firstMockProfileDocument,
      firstMockMapDocument,
      'provider',
      { baseUrl: mockServer.url, security: [] },
      client
    );
    //Mocking first bounded provider
    const secondMockBoundProfileProvider = new BoundProfileProvider(
      firstMockProfileDocument,
      secondMockMapDocument,
      'second',
      { baseUrl: mockServer.url, security: [] },
      client
    );
    const cacheBoundProfileProviderSpy = jest
      .spyOn(client, 'cacheBoundProfileProvider')
      .mockImplementation(
        (
          _profileConfig: ProfileConfiguration,
          providerConfig: ProviderConfiguration
        ) => {
          if (providerConfig.name === 'provider') {
            return new Promise(resolve =>
              resolve(firstMockBoundProfileProvider)
            );
          }

          return new Promise(resolve =>
            resolve(secondMockBoundProfileProvider)
          );
        }
      );

    const profile = await client.getProfile('starwars/character-information');
    const useCase = profile.getUseCase('Test');
    const result = await useCase.perform(undefined);

    expect(result.isOk() && result.value).toEqual({
      message: 'hello from second provider',
    });
    //We send request twice
    expect((await endpoint.getSeenRequests()).length).toEqual(2);
    expect(cacheBoundProfileProviderSpy).toHaveBeenCalledTimes(2);
    expect((await secondEndpoint.getSeenRequests()).length).toEqual(1);
  }, 20000);

  it('use circuit-breaker policy - do not switch providers after HTTP 500 - using provider from user', async () => {
    const mockLoadSync = jest.fn();

    const endpoint = await mockServer.get('/first').thenJson(500, {});
    const secondEndpoint = await mockServer.get('/second').thenJson(200, {});

    const mockSuperJson = new SuperJson({
      profiles: {
        ['starwars/character-information']: {
          version: '1.0.0',
          defaults: {
            Test: {
              providerFailover: true,
            },
          },
          priority: ['provider', 'second'],
          providers: {
            provider: {
              defaults: {
                Test: {
                  input: {},
                  retryPolicy: {
                    kind: OnFail.CIRCUIT_BREAKER,
                    maxContiguousRetries: 2,
                    requestTimeout: 1000,
                  },
                },
              },
            },
            second: {},
          },
        },
      },
      providers: {
        provider: {
          security: [],
        },
        second: {
          security: [],
        },
      },
    });

    mockLoadSync.mockReturnValue(ok(mockSuperJson));
    SuperJson.loadSync = mockLoadSync;

    const client = new SuperfaceClient();

    //Mocking first bounded provider
    const firstMockBoundProfileProvider = new BoundProfileProvider(
      firstMockProfileDocument,
      firstMockMapDocument,
      'provider',
      { baseUrl: mockServer.url, security: [] },
      client
    );
    //Mocking first bounded provider
    const secondMockBoundProfileProvider = new BoundProfileProvider(
      firstMockProfileDocument,
      secondMockMapDocument,
      'second',
      { baseUrl: mockServer.url, security: [] },
      client
    );
    const cacheBoundProfileProviderSpy = jest
      .spyOn(client, 'cacheBoundProfileProvider')
      .mockImplementation(
        (
          _profileConfig: ProfileConfiguration,
          providerConfig: ProviderConfiguration
        ) => {
          if (providerConfig.name === 'provider') {
            return new Promise(resolve =>
              resolve(firstMockBoundProfileProvider)
            );
          }

          return new Promise(resolve =>
            resolve(secondMockBoundProfileProvider)
          );
        }
      );

    const profile = await client.getProfile('starwars/character-information');
    const useCase = profile.getUseCase('Test');
    const result = await useCase.perform(undefined, { provider: 'provider' });

    expect(result.isErr() && result.error.message).toContain(
      'Circuit breaker is open'
    );

    expect((await endpoint.getSeenRequests()).length).toEqual(2);
    expect(cacheBoundProfileProviderSpy).toHaveBeenCalledTimes(1);
    expect((await secondEndpoint.getSeenRequests()).length).toEqual(0);
  }, 20000);

  it('use circuit-breaker policy - do not switch providers after HTTP 500, providerFailover is false', async () => {
    const mockLoadSync = jest.fn();

    const endpoint = await mockServer.get('/first').thenJson(500, {});
    const secondEndpoint = await mockServer.get('/second').thenJson(200, {});

    const mockSuperJson = new SuperJson({
      profiles: {
        ['starwars/character-information']: {
          version: '1.0.0',
          defaults: {
            Test: {
              //False
              providerFailover: false,
            },
          },
          //Set
          priority: ['provider', 'second'],
          providers: {
            provider: {
              defaults: {
                Test: {
                  input: {},
                  retryPolicy: {
                    kind: OnFail.CIRCUIT_BREAKER,
                    maxContiguousRetries: 2,
                    requestTimeout: 1000,
                  },
                },
              },
            },
            second: {},
          },
        },
      },
      providers: {
        provider: {
          security: [],
        },
        second: {
          security: [],
        },
      },
    });

    mockLoadSync.mockReturnValue(ok(mockSuperJson));
    SuperJson.loadSync = mockLoadSync;

    const client = new SuperfaceClient();

    //Mocking first bounded provider
    const firstMockBoundProfileProvider = new BoundProfileProvider(
      firstMockProfileDocument,
      firstMockMapDocument,
      'provider',
      { baseUrl: mockServer.url, security: [] },
      client
    );
    //Mocking first bounded provider
    const secondMockBoundProfileProvider = new BoundProfileProvider(
      firstMockProfileDocument,
      secondMockMapDocument,
      'second',
      { baseUrl: mockServer.url, security: [] },
      client
    );
    const cacheBoundProfileProviderSpy = jest
      .spyOn(client, 'cacheBoundProfileProvider')
      .mockImplementation(
        (
          _profileConfig: ProfileConfiguration,
          providerConfig: ProviderConfiguration
        ) => {
          if (providerConfig.name === 'provider') {
            return new Promise(resolve =>
              resolve(firstMockBoundProfileProvider)
            );
          }

          return new Promise(resolve =>
            resolve(secondMockBoundProfileProvider)
          );
        }
      );

    const profile = await client.getProfile('starwars/character-information');
    const useCase = profile.getUseCase('Test');
    const result = await useCase.perform(undefined);

    expect(result.isErr() && result.error.message).toContain(
      'Circuit breaker is open'
    );
    //We send request twice - to the first provider url
    expect((await endpoint.getSeenRequests()).length).toEqual(2);
    //We did not switch to second provider
    expect(cacheBoundProfileProviderSpy).toHaveBeenCalledTimes(1);
    expect((await secondEndpoint.getSeenRequests()).length).toEqual(0);
  }, 20000);

  it('use circuit-breaker policy - switch providers after HTTP 500, use implict priority array', async () => {
    const mockLoadSync = jest.fn();

    const endpoint = await mockServer.get('/first').thenJson(500, {});
    const secondEndpoint = await mockServer.get('/second').thenJson(200, {});

    const mockSuperJson = new SuperJson({
      profiles: {
        ['starwars/character-information']: {
          version: '1.0.0',
          defaults: {
            Test: {
              //True
              providerFailover: true,
            },
          },
          //
          priority: [],
          providers: {
            provider: {
              defaults: {
                Test: {
                  input: {},
                  retryPolicy: {
                    kind: OnFail.CIRCUIT_BREAKER,
                    maxContiguousRetries: 2,
                    requestTimeout: 1000,
                  },
                },
              },
            },
            second: {},
          },
        },
      },
      providers: {
        provider: {
          security: [],
        },
        second: {
          security: [],
        },
      },
    });

    mockLoadSync.mockReturnValue(ok(mockSuperJson));
    SuperJson.loadSync = mockLoadSync;

    const client = new SuperfaceClient();

    //Mocking first bounded provider
    const firstMockBoundProfileProvider = new BoundProfileProvider(
      firstMockProfileDocument,
      firstMockMapDocument,
      'provider',
      { baseUrl: mockServer.url, security: [] },
      client
    );
    //Mocking first bounded provider
    const secondMockBoundProfileProvider = new BoundProfileProvider(
      firstMockProfileDocument,
      secondMockMapDocument,
      'second',
      { baseUrl: mockServer.url, security: [] },
      client
    );
    const cacheBoundProfileProviderSpy = jest
      .spyOn(client, 'cacheBoundProfileProvider')
      .mockImplementation(
        (
          _profileConfig: ProfileConfiguration,
          providerConfig: ProviderConfiguration
        ) => {
          if (providerConfig.name === 'provider') {
            return new Promise(resolve =>
              resolve(firstMockBoundProfileProvider)
            );
          }

          return new Promise(resolve =>
            resolve(secondMockBoundProfileProvider)
          );
        }
      );

    const profile = await client.getProfile('starwars/character-information');
    const useCase = profile.getUseCase('Test');
    const result = await useCase.perform(undefined);

    expect(result.isOk() && result.value).toEqual({
      message: 'hello from second provider',
    });
    //We send request twice - to the first provider url
    expect((await endpoint.getSeenRequests()).length).toEqual(2);
    //We did not switch to second provider
    expect(cacheBoundProfileProviderSpy).toHaveBeenCalledTimes(2);
    expect((await secondEndpoint.getSeenRequests()).length).toEqual(1);
  }, 20000);

  it('use two circuit-breaker policies - switch providers after HTTP 500', async () => {
    const mockLoadSync = jest.fn();

    const endpoint = await mockServer.get('/first').thenJson(500, {});
    const secondEndpoint = await mockServer.get('/second').thenJson(200, {});

    const mockSuperJson = new SuperJson({
      profiles: {
        ['starwars/character-information']: {
          version: '1.0.0',
          defaults: {
            Test: {
              providerFailover: true,
            },
          },
          priority: [],
          providers: {
            provider: {
              defaults: {
                Test: {
                  input: {},
                  retryPolicy: {
                    kind: OnFail.CIRCUIT_BREAKER,
                    maxContiguousRetries: 2,
                    requestTimeout: 1000,
                  },
                },
              },
            },
            second: {
              defaults: {
                Test: {
                  input: {},
                  retryPolicy: {
                    kind: OnFail.CIRCUIT_BREAKER,
                    maxContiguousRetries: 2,
                    requestTimeout: 1000,
                  },
                },
              },
            },
          },
        },
      },
      providers: {
        provider: {
          security: [],
        },
        second: {
          security: [],
        },
      },
    });

    mockLoadSync.mockReturnValue(ok(mockSuperJson));
    SuperJson.loadSync = mockLoadSync;

    const client = new SuperfaceClient();

    //Mocking first bounded provider
    const firstMockBoundProfileProvider = new BoundProfileProvider(
      firstMockProfileDocument,
      firstMockMapDocument,
      'provider',
      { baseUrl: mockServer.url, security: [] },
      client
    );
    //Mocking first bounded provider
    const secondMockBoundProfileProvider = new BoundProfileProvider(
      firstMockProfileDocument,
      secondMockMapDocument,
      'second',
      { baseUrl: mockServer.url, security: [] },
      client
    );
    const cacheBoundProfileProviderSpy = jest
      .spyOn(client, 'cacheBoundProfileProvider')
      .mockImplementation(
        (
          _profileConfig: ProfileConfiguration,
          providerConfig: ProviderConfiguration
        ) => {
          if (providerConfig.name === 'provider') {
            return new Promise(resolve =>
              resolve(firstMockBoundProfileProvider)
            );
          }

          return new Promise(resolve =>
            resolve(secondMockBoundProfileProvider)
          );
        }
      );

    const profile = await client.getProfile('starwars/character-information');
    const useCase = profile.getUseCase('Test');
    let result = await useCase.perform(undefined);

    expect(result.isOk() && result.value).toEqual({
      message: 'hello from second provider',
    });
    result = await useCase.perform(undefined);
    expect(result.isOk() && result.value).toEqual({
      message: 'hello from second provider',
    });

    //We send request twice - to the first provider url
    expect((await endpoint.getSeenRequests()).length).toEqual(2);
    expect(cacheBoundProfileProviderSpy).toHaveBeenCalledTimes(3);
    expect((await secondEndpoint.getSeenRequests()).length).toEqual(2);
  }, 20000);

  it('use circuit-breaker policy - switch providers after HTTP 500 and switch back - default provider', async () => {
    const mockLoadSync = jest.fn();

    let retry = 0;
    const endpoint = await mockServer.get('/first').thenCallback(() => {
      if (retry < 2) {
        retry++;

        return {
          statusCode: 500,
          json: {},
        };
      }

      return {
        statusCode: 200,
        json: {},
      };
    });
    const secondEndpoint = await mockServer.get('/second').thenJson(200, {});

    const mockSuperJson = new SuperJson({
      profiles: {
        ['starwars/character-information']: {
          version: '1.0.0',
          defaults: {
            Test: {
              providerFailover: true,
            },
          },
          priority: ['provider', 'second'],
          providers: {
            provider: {
              defaults: {
                Test: {
                  input: {},
                  retryPolicy: {
                    kind: OnFail.CIRCUIT_BREAKER,
                    maxContiguousRetries: 2,
                    requestTimeout: 1000,
                  },
                },
              },
            },
            second: {},
          },
        },
      },
      providers: {
        provider: {
          security: [],
        },
        second: {
          security: [],
        },
      },
    });

    mockLoadSync.mockReturnValue(ok(mockSuperJson));
    SuperJson.loadSync = mockLoadSync;

    const client = new SuperfaceClient();

    //Mocking first bounded provider
    const firstMockBoundProfileProvider = new BoundProfileProvider(
      firstMockProfileDocument,
      firstMockMapDocument,
      'provider',
      { baseUrl: mockServer.url, security: [] },
      client
    );
    //Mocking first bounded provider
    const secondMockBoundProfileProvider = new BoundProfileProvider(
      firstMockProfileDocument,
      secondMockMapDocument,
      'second',
      { baseUrl: mockServer.url, security: [] },
      client
    );
    const cacheBoundProfileProviderSpy = jest
      .spyOn(client, 'cacheBoundProfileProvider')
      .mockImplementation(
        (
          _profileConfig: ProfileConfiguration,
          providerConfig: ProviderConfiguration
        ) => {
          if (providerConfig.name === 'provider') {
            return new Promise(resolve =>
              resolve(firstMockBoundProfileProvider)
            );
          }

          return new Promise(resolve =>
            resolve(secondMockBoundProfileProvider)
          );
        }
      );

    const profile = await client.getProfile('starwars/character-information');
    const useCase = profile.getUseCase('Test');
    //Try first provider two times then switch to second and return value
    let result = await useCase.perform(undefined);

    expect(result.isOk() && result.value).toEqual({
      message: 'hello from second provider',
    });

    //Wait
    await sleep(30000);

    //Try first provider and return value
    result = await useCase.perform(undefined);

    expect(result.isOk() && result.value).toEqual({ message: 'hello' });
    //We send request twice
    expect((await endpoint.getSeenRequests()).length).toEqual(3);
    expect(cacheBoundProfileProviderSpy).toHaveBeenCalledTimes(4);
    expect((await secondEndpoint.getSeenRequests()).length).toEqual(1);
  }, 40000);

  it('use circuit-breaker policy - switch providers after HTTP 500 and perform another usecase', async () => {
    const mockLoadSync = jest.fn();

    let retry = 0;
    const endpoint = await mockServer.get('/first').thenCallback(() => {
      if (retry < 2) {
        retry++;

        return {
          statusCode: 500,
          json: {},
        };
      }

      return {
        statusCode: 200,
        json: {},
      };
    });
    const secondEndpoint = await mockServer.get('/second').thenJson(200, {});

    const mockSuperJson = new SuperJson({
      profiles: {
        ['starwars/character-information']: {
          version: '1.0.0',
          defaults: {
            Test: {
              providerFailover: true,
            },
          },
          priority: ['provider', 'second'],
          providers: {
            provider: {
              defaults: {
                Test: {
                  input: {},
                  retryPolicy: {
                    kind: OnFail.CIRCUIT_BREAKER,
                    maxContiguousRetries: 2,
                    requestTimeout: 1000,
                  },
                },
              },
            },
            second: {},
          },
        },
      },
      providers: {
        provider: {
          security: [],
        },
        second: {
          security: [],
        },
      },
    });

    mockLoadSync.mockReturnValue(ok(mockSuperJson));
    SuperJson.loadSync = mockLoadSync;

    const client = new SuperfaceClient();

    //Mocking first bounded provider
    const firstMockBoundProfileProvider = new BoundProfileProvider(
      firstMockProfileDocument,
      firstMockMapDocument,
      'provider',
      { baseUrl: mockServer.url, security: [] },
      client
    );
    //Mocking first bounded provider
    const secondMockBoundProfileProvider = new BoundProfileProvider(
      firstMockProfileDocument,
      secondMockMapDocument,
      'second',
      { baseUrl: mockServer.url, security: [] },
      client
    );
    const cacheBoundProfileProviderSpy = jest
      .spyOn(client, 'cacheBoundProfileProvider')
      .mockImplementation(
        (
          _profileConfig: ProfileConfiguration,
          providerConfig: ProviderConfiguration
        ) => {
          if (providerConfig.name === 'provider') {
            return new Promise(resolve =>
              resolve(firstMockBoundProfileProvider)
            );
          }

          return new Promise(resolve =>
            resolve(secondMockBoundProfileProvider)
          );
        }
      );

    const profile = await client.getProfile('starwars/character-information');
    let useCase = profile.getUseCase('Test');
    //Try first provider two times then switch to second and return value
    let result = await useCase.perform(undefined);

    expect(result.isOk() && result.value).toEqual({
      message: 'hello from second provider',
    });

    //Try first provider second usecase and return value
    useCase = profile.getUseCase('SecondUseCase');
    result = await useCase.perform(undefined);

    expect(result.isOk() && result.value).toEqual({
      message: 'hello from first provider and second usecase',
    });
    //We send request twice
    expect((await endpoint.getSeenRequests()).length).toEqual(3);
    expect(cacheBoundProfileProviderSpy).toHaveBeenCalledTimes(3);
    expect((await secondEndpoint.getSeenRequests()).length).toEqual(1);
  }, 20000);

  it('use circuit-breaker policy - switch providers after HTTP 500, perform another usecase and switch profile', async () => {
    const mockLoadSync = jest.fn();

    let retry = 0;
    const endpoint = await mockServer.get('/first').thenCallback(() => {
      if (retry < 2) {
        retry++;

        return {
          statusCode: 500,
          json: {},
        };
      }

      return {
        statusCode: 200,
        json: {},
      };
    });
    const secondEndpoint = await mockServer.get('/second').thenJson(200, {});
    const thirdEndpoint = await mockServer.get('/third').thenJson(200, {});

    const mockSuperJson = new SuperJson({
      profiles: {
        ['starwars/character-information']: {
          version: '1.0.0',
          priority: ['provider', 'second'],
          defaults: {
            Test: {
              providerFailover: true,
            },
          },
          providers: {
            provider: {
              defaults: {
                Test: {
                  input: {},
                  retryPolicy: {
                    kind: OnFail.CIRCUIT_BREAKER,
                    maxContiguousRetries: 2,
                    requestTimeout: 1000,
                  },
                },
              },
            },
            second: {},
          },
        },
        ['startrek/character-information']: {
          version: '1.0.0',
          providers: { third: {} },
        },
      },
      providers: {
        provider: {
          security: [],
        },
        second: {
          security: [],
        },
        third: {
          security: [],
        },
      },
    });

    mockLoadSync.mockReturnValue(ok(mockSuperJson));
    SuperJson.loadSync = mockLoadSync;

    const client = new SuperfaceClient();

    //Mocking first bounded provider
    const firstMockBoundProfileProvider = new BoundProfileProvider(
      firstMockProfileDocument,
      firstMockMapDocument,
      'provider',
      { baseUrl: mockServer.url, security: [] },
      client
    );
    //Mocking first bounded provider
    const secondMockBoundProfileProvider = new BoundProfileProvider(
      firstMockProfileDocument,
      secondMockMapDocument,
      'second',
      { baseUrl: mockServer.url, security: [] },
      client
    );
    //Mocking third bounded provider
    const thirdMockBoundProfileProvider = new BoundProfileProvider(
      secondMockProfiledDocument,
      thirdMockMapDocument,
      'third',
      { baseUrl: mockServer.url, security: [] },
      client
    );
    const cacheBoundProfileProviderSpy = jest
      .spyOn(client, 'cacheBoundProfileProvider')
      .mockImplementation(
        (
          _profileConfig: ProfileConfiguration,
          providerConfig: ProviderConfiguration
        ) => {
          if (providerConfig.name === 'provider') {
            return new Promise(resolve =>
              resolve(firstMockBoundProfileProvider)
            );
          }
          if (providerConfig.name === 'second') {
            return new Promise(resolve =>
              resolve(secondMockBoundProfileProvider)
            );
          }

          return new Promise(resolve => resolve(thirdMockBoundProfileProvider));
        }
      );

    let profile = await client.getProfile('starwars/character-information');
    let useCase = profile.getUseCase('Test');
    //Try first provider two times then switch to second and return value
    let result = await useCase.perform(undefined);

    expect(result.isOk() && result.value).toEqual({
      message: 'hello from second provider',
    });

    //Try first provider second usecase and return value
    useCase = profile.getUseCase('SecondUseCase');
    result = await useCase.perform(undefined);

    expect(result.isOk() && result.value).toEqual({
      message: 'hello from first provider and second usecase',
    });

    profile = await client.getProfile('startrek/character-information');
    useCase = profile.getUseCase('Test');
    result = await useCase.perform(undefined);

    expect(result.isOk() && result.value).toEqual({
      message: 'hello from third provider',
    });

    expect((await endpoint.getSeenRequests()).length).toEqual(3);
    expect(cacheBoundProfileProviderSpy).toHaveBeenCalledTimes(4);
    expect((await secondEndpoint.getSeenRequests()).length).toEqual(1);
    expect((await thirdEndpoint.getSeenRequests()).length).toEqual(1);
  }, 60000);

  it('use circuit-breaker policy - switch providers after HTTP 500, using provider from user and abort policy', async () => {
    const mockLoadSync = jest.fn();

    const endpoint = await mockServer.get('/first').thenJson(500, {});
    const secondEndpoint = await mockServer.get('/second').thenJson(200, {});

    const mockSuperJson = new SuperJson({
      profiles: {
        ['starwars/character-information']: {
          version: '1.0.0',
          defaults: {
            Test: {
              providerFailover: true,
            },
          },
          priority: ['provider', 'second'],
          providers: {
            provider: {
              defaults: {
                Test: {
                  input: {},
                  retryPolicy: OnFail.NONE,
                },
              },
            },
            second: {
              defaults: {
                Test: {
                  input: {},
                  retryPolicy: {
                    kind: OnFail.CIRCUIT_BREAKER,
                    maxContiguousRetries: 2,
                    requestTimeout: 1000,
                  },
                },
              },
            },
          },
        },
      },
      providers: {
        provider: {
          security: [],
        },
        second: {
          security: [],
        },
      },
    });

    mockLoadSync.mockReturnValue(ok(mockSuperJson));
    SuperJson.loadSync = mockLoadSync;

    const client = new SuperfaceClient();

    //Mocking first bounded provider
    const firstMockBoundProfileProvider = new BoundProfileProvider(
      firstMockProfileDocument,
      firstMockMapDocument,
      'provider',
      { baseUrl: mockServer.url, security: [] },
      client
    );
    //Mocking first bounded provider
    const secondMockBoundProfileProvider = new BoundProfileProvider(
      firstMockProfileDocument,
      secondMockMapDocument,
      'second',
      { baseUrl: mockServer.url, security: [] },
      client
    );
    const cacheBoundProfileProviderSpy = jest
      .spyOn(client, 'cacheBoundProfileProvider')
      .mockImplementation(
        (
          _profileConfig: ProfileConfiguration,
          providerConfig: ProviderConfiguration
        ) => {
          if (providerConfig.name === 'provider') {
            return new Promise(resolve =>
              resolve(firstMockBoundProfileProvider)
            );
          }

          return new Promise(resolve =>
            resolve(secondMockBoundProfileProvider)
          );
        }
      );

    const profile = await client.getProfile('starwars/character-information');
    const useCase = profile.getUseCase('Test');
    const result = await useCase.perform(undefined);

    expect(result.isOk() && result.value).toEqual({
      message: 'hello from second provider',
    });
    //We send request twice
    expect((await endpoint.getSeenRequests()).length).toEqual(1);
    expect(cacheBoundProfileProviderSpy).toHaveBeenCalledTimes(2);
    expect((await secondEndpoint.getSeenRequests()).length).toEqual(1);
  }, 20000);
});
