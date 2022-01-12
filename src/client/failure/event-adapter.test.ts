import {
  AstMetadata,
  BackoffKind,
  MapDocumentNode,
  OnFail,
  ProfileDocumentNode,
  SuperJsonDocument,
} from '@superfaceai/ast';
import { getLocal } from 'mockttp';

import { SuperJson } from '../../internal';
import { ok, sleep } from '../../lib';
import { ServiceSelector } from '../../lib/services';
import {
  createTypedClient,
  invalidateSuperfaceClientCache,
  SuperfaceClient,
  SuperfaceClientBase,
} from '../client';
import { BoundProfileProvider } from '../profile-provider';

const astMetadata: AstMetadata = {
  sourceChecksum: 'checksum',
  astVersion: {
    major: 1,
    minor: 0,
    patch: 0,
    label: undefined,
  },
  parserVersion: {
    major: 1,
    minor: 0,
    patch: 0,
    label: undefined,
  },
};

const firstMockProfileDocument: ProfileDocumentNode = {
  astMetadata,
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
        value: {
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
        value: {
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
  astMetadata,

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
        value: {
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
  astMetadata,

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
  astMetadata,

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
  astMetadata,
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

function mockSuperJson(document: SuperJsonDocument) {
  const mockLoadSync = jest.fn();
  mockLoadSync.mockReturnValue(ok(new SuperJson(document)));
  SuperJson.loadSync = mockLoadSync;
}

function spyOnCacheBoundProfileProvider(client: SuperfaceClientBase) {
  const firstMockBoundProfileProvider = new BoundProfileProvider(
    firstMockProfileDocument,
    firstMockMapDocument,
    'provider',
    { services: ServiceSelector.withDefaultUrl(mockServer.url), security: [] },
    client
  );
  const secondMockBoundProfileProvider = new BoundProfileProvider(
    firstMockProfileDocument,
    secondMockMapDocument,
    'second',
    { services: ServiceSelector.withDefaultUrl(mockServer.url), security: [] },
    client
  );
  const thirdMockBoundProfileProvider = new BoundProfileProvider(
    secondMockProfiledDocument,
    thirdMockMapDocument,
    'third',
    { services: ServiceSelector.withDefaultUrl(mockServer.url), security: [] },
    client
  );
  const cacheBoundProfileProviderSpy = jest
    .spyOn(client, 'cacheBoundProfileProvider')
    .mockImplementation((_, providerConfig) => {
      switch (providerConfig.name) {
        case 'provider':
          return Promise.resolve(firstMockBoundProfileProvider);

        case 'second':
          return Promise.resolve(secondMockBoundProfileProvider);

        case 'third':
          return Promise.resolve(thirdMockBoundProfileProvider);

        default:
          throw 'unreachable';
      }
    });

  return cacheBoundProfileProviderSpy;
}

describe.each([
  { name: 'untyped', clientFactory: () => new SuperfaceClient() },
  {
    name: 'typed',
    clientFactory: () => {
      const TypedClient = createTypedClient({
        ['starwars/character-information']: {
          Test: [undefined, { message: '' }],
          SecondUseCase: [undefined, { message: '' }],
        },
        ['startrek/character-information']: {
          Test: [undefined, { message: '' }],
        },
      });

      return new TypedClient();
    },
  },
])('event-adapter $name', ({ name: _name, clientFactory }) => {
  beforeEach(async () => {
    await mockServer.start();
  });

  afterEach(async () => {
    await mockServer.stop();
    invalidateSuperfaceClientCache();
  });

  //Without retry policy
  it('does not use retry policy - returns after HTTP 200', async () => {
    const endpoint = await mockServer.get('/first').thenJson(200, {});
    mockSuperJson({
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

    //Not mocked client
    const client = clientFactory();
    const cacheBoundProfileProviderSpy = spyOnCacheBoundProfileProvider(client);

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
    const endpoint = await mockServer.get('/first').thenJson(500, {});
    mockSuperJson({
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

    const client = clientFactory();

    const cacheBoundProfileProviderSpy = spyOnCacheBoundProfileProvider(client);

    const profile = await client.getProfile('starwars/character-information');
    const useCase = profile.getUseCase('Test');
    const provider = await client.getProvider('provider');
    const result = useCase.perform(undefined, { provider });

    await expect(result).rejects.toThrow(/status code: 500/);

    expect((await endpoint.getSeenRequests()).length).toEqual(1);
    expect(cacheBoundProfileProviderSpy).toHaveBeenCalledTimes(1);
  });

  it('does not use retry policy - aborts after closed connection', async () => {
    await mockServer.get('/first').thenCloseConnection();
    mockSuperJson({
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

    const client = clientFactory();

    const cacheBoundProfileProviderSpy = spyOnCacheBoundProfileProvider(client);

    const profile = await client.getProfile('starwars/character-information');
    const useCase = profile.getUseCase('Test');
    const provider = await client.getProvider('provider');
    const result = useCase.perform(undefined, { provider });

    await expect(result).rejects.toThrow(/network error/);
    expect(cacheBoundProfileProviderSpy).toHaveBeenCalledTimes(1);
  });

  it('does not use retry policy - aborts after timeout', async () => {
    await mockServer.get('/first').thenTimeout();
    mockSuperJson({
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

    const client = clientFactory();

    const cacheBoundProfileProviderSpy = spyOnCacheBoundProfileProvider(client);

    const profile = await client.getProfile('starwars/character-information');
    const useCase = profile.getUseCase('Test');
    const provider = await client.getProvider('provider');
    const result = useCase.perform(undefined, { provider });

    await expect(result).rejects.toThrow(/timeout/);
    expect(cacheBoundProfileProviderSpy).toHaveBeenCalledTimes(1);
  }, 35000);

  //Circuit breaker
  it('use circuit-breaker policy - aborts after HTTP 500', async () => {
    const endpoint = await mockServer.get('/first').thenJson(500, {});
    mockSuperJson({
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

    const client = clientFactory();

    const cacheBoundProfileProviderSpy = spyOnCacheBoundProfileProvider(client);

    const profile = await client.getProfile('starwars/character-information');
    const useCase = profile.getUseCase('Test');
    const provider = await client.getProvider('provider');
    const result = useCase.perform(undefined, { provider });

    await expect(result).rejects.toThrow(/status code: 500/);

    //We send request twice
    expect((await endpoint.getSeenRequests()).length).toEqual(2);
    expect(cacheBoundProfileProviderSpy).toHaveBeenCalledTimes(1);
  }, 20000);

  it('use circuit-breaker policy with backoff - aborts after HTTP 500', async () => {
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

    mockSuperJson({
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

    const client = clientFactory();

    const cacheBoundProfileProviderSpy = spyOnCacheBoundProfileProvider(client);

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
    const endpoint = await mockServer.get('/first').thenJson(500, {});
    const secondEndpoint = await mockServer.get('/second').thenJson(200, {});
    mockSuperJson({
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

    const client = clientFactory();

    const cacheBoundProfileProviderSpy = spyOnCacheBoundProfileProvider(client);

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
    const endpoint = await mockServer.get('/first').thenJson(500, {});
    const secondEndpoint = await mockServer.get('/second').thenJson(200, {});
    mockSuperJson({
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

    const client = clientFactory();

    const cacheBoundProfileProviderSpy = spyOnCacheBoundProfileProvider(client);

    const profile = await client.getProfile('starwars/character-information');
    const useCase = profile.getUseCase('Test');
    const result = useCase.perform(undefined, { provider: 'provider' });

    await expect(result).rejects.toThrow(/status code: 500/);

    expect((await endpoint.getSeenRequests()).length).toEqual(2);
    expect(cacheBoundProfileProviderSpy).toHaveBeenCalledTimes(1);
    expect((await secondEndpoint.getSeenRequests()).length).toEqual(0);
  });

  it('use circuit-breaker policy - do not switch providers after HTTP 500, providerFailover is false', async () => {
    const endpoint = await mockServer.get('/first').thenJson(500, {});
    const secondEndpoint = await mockServer.get('/second').thenJson(200, {});
    mockSuperJson({
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

    const client = clientFactory();

    const cacheBoundProfileProviderSpy = spyOnCacheBoundProfileProvider(client);

    const profile = await client.getProfile('starwars/character-information');
    const useCase = profile.getUseCase('Test');
    const result = useCase.perform(undefined);

    await expect(result).rejects.toThrow(/No backup provider available/);

    //We send request twice - to the first provider url
    expect((await endpoint.getSeenRequests()).length).toEqual(2);
    //We did not switch to second provider
    expect(cacheBoundProfileProviderSpy).toHaveBeenCalledTimes(1);
    expect((await secondEndpoint.getSeenRequests()).length).toEqual(0);
  });

  it('use circuit-breaker policy - switch providers after HTTP 500, use implict priority array', async () => {
    const endpoint = await mockServer.get('/first').thenJson(500, {});
    const secondEndpoint = await mockServer.get('/second').thenJson(200, {});
    mockSuperJson({
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

    const client = clientFactory();

    const cacheBoundProfileProviderSpy = spyOnCacheBoundProfileProvider(client);

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
    const endpoint = await mockServer.get('/first').thenJson(500, {});
    const secondEndpoint = await mockServer.get('/second').thenJson(200, {});
    mockSuperJson({
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

    const client = clientFactory();

    const cacheBoundProfileProviderSpy = spyOnCacheBoundProfileProvider(client);

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
    let endpointCalls = 0;
    const endpoint = await mockServer.get('/first').thenCallback(() => {
      endpointCalls += 1;

      if (endpointCalls > 2) {
        return { statusCode: 200, json: {} };
      } else {
        return { statusCode: 500, json: {} };
      }
    });
    const secondEndpoint = await mockServer.get('/second').thenJson(200, {});

    mockSuperJson({
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

    const client = clientFactory();

    const cacheBoundProfileProviderSpy = spyOnCacheBoundProfileProvider(client);

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
    expect(cacheBoundProfileProviderSpy).toHaveBeenCalledTimes(3);
    expect((await secondEndpoint.getSeenRequests()).length).toEqual(1);
  }, 40000);

  it('use circuit-breaker policy - switch providers after HTTP 500 and perform another usecase', async () => {
    let endpointCalls = 0;
    const endpoint = await mockServer.get('/first').thenCallback(() => {
      endpointCalls += 1;

      if (endpointCalls > 2) {
        return { statusCode: 200, json: {} };
      } else {
        return { statusCode: 500, json: {} };
      }
    });
    const secondEndpoint = await mockServer.get('/second').thenJson(200, {});

    mockSuperJson({
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

    const client = clientFactory();

    const cacheBoundProfileProviderSpy = spyOnCacheBoundProfileProvider(client);

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
    let endpointCalls = 0;
    const endpoint = await mockServer.get('/first').thenCallback(() => {
      endpointCalls += 1;

      if (endpointCalls > 2) {
        return { statusCode: 200, json: {} };
      } else {
        return { statusCode: 500, json: {} };
      }
    });
    const secondEndpoint = await mockServer.get('/second').thenJson(200, {});
    const thirdEndpoint = await mockServer.get('/third').thenJson(200, {});

    mockSuperJson({
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

    const client = clientFactory();

    const cacheBoundProfileProviderSpy = spyOnCacheBoundProfileProvider(client);

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

    const profile2 = await client.getProfile('startrek/character-information');
    const useCase2 = profile2.getUseCase('Test');
    result = await useCase2.perform(undefined);

    expect(result.isOk() && result.value).toEqual({
      message: 'hello from third provider',
    });

    expect((await endpoint.getSeenRequests()).length).toEqual(3);
    expect(cacheBoundProfileProviderSpy).toHaveBeenCalledTimes(4);
    expect((await secondEndpoint.getSeenRequests()).length).toEqual(1);
    expect((await thirdEndpoint.getSeenRequests()).length).toEqual(1);
  }, 60000);

  it('use circuit-breaker policy - switch providers after HTTP 500, using provider from user and abort policy', async () => {
    const endpoint = await mockServer.get('/first').thenJson(500, {});
    const secondEndpoint = await mockServer.get('/second').thenJson(200, {});

    mockSuperJson({
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

    const client = clientFactory();

    const cacheBoundProfileProviderSpy = spyOnCacheBoundProfileProvider(client);

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

  it('preserves hook context within one client', async () => {
    const endpoint = await mockServer.get('/first').thenJson(500, {});
    const secondEndpoint = await mockServer.get('/second').thenJson(200, {});
    mockSuperJson({
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

    const client = clientFactory();
    spyOnCacheBoundProfileProvider(client);

    let result = await (
      await client.getProfile('starwars/character-information')
    )
      .getUseCase('Test')
      .perform(undefined);
    expect(result.isOk() && result.value).toEqual({
      message: 'hello from second provider',
    });

    result = await (await client.getProfile('starwars/character-information'))
      .getUseCase('Test')
      .perform(undefined);
    expect(result.isOk() && result.value).toEqual({
      message: 'hello from second provider',
    });

    // the initial two failover requests
    expect((await endpoint.getSeenRequests()).length).toEqual(2);

    // the two results
    expect((await secondEndpoint.getSeenRequests()).length).toEqual(2);
  });

  it('does not preserve hook context across clients', async () => {
    const endpoint = await mockServer.get('/first').thenJson(500, {});
    const secondEndpoint = await mockServer.get('/second').thenJson(200, {});
    mockSuperJson({
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

    {
      const client = clientFactory();
      spyOnCacheBoundProfileProvider(client);

      const result = await (
        await client.getProfile('starwars/character-information')
      )
        .getUseCase('Test')
        .perform(undefined);
      expect(result.isOk() && result.value).toEqual({
        message: 'hello from second provider',
      });
    }

    {
      const client = clientFactory();
      spyOnCacheBoundProfileProvider(client);

      const result = await (
        await client.getProfile('starwars/character-information')
      )
        .getUseCase('Test')
        .perform(undefined);
      expect(result.isOk() && result.value).toEqual({
        message: 'hello from second provider',
      });
    }

    // the initial two failover requests for each client
    expect((await endpoint.getSeenRequests()).length).toEqual(4);

    // the two results
    expect((await secondEndpoint.getSeenRequests()).length).toEqual(2);
  });
});
