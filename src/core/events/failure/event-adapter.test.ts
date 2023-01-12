import type {
  AstMetadata,
  MapDocumentNode,
  NormalizedSuperJsonDocument,
  ProfileDocumentNode,
} from '@superfaceai/ast';
import { BackoffKind, OnFail } from '@superfaceai/ast';
import { getLocal } from 'mockttp';

import type { IConfig } from '../../../interfaces';
import type { Result } from '../../../lib';
import { err, ok } from '../../../lib';
import { MockClient, MockEnvironment } from '../../../mock';
import { normalizeSuperJsonDocument } from '../../../schema-tools/superjson/normalize';
import type { FileSystemError } from '../../errors';
import { bindResponseError, NotFoundError } from '../../errors';
import { Provider, ProviderConfiguration } from '../../provider';

const Connection = 'close';

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

const secondMockProfileDocument: ProfileDocumentNode = {
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

describe('event-adapter', () => {
  const superJson = normalizeSuperJsonDocument(
    {
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
    },
    new MockEnvironment()
  );

  beforeEach(async () => {
    await mockServer.start();
  });

  afterEach(async () => {
    await mockServer.stop();
  });

  const createMockClient = (options?: {
    profileAstPath?: string;
    superJson?: NormalizedSuperJsonDocument;
    ast?: ProfileDocumentNode;
    config?: Partial<IConfig>;
  }): MockClient => {
    return new MockClient(
      options?.superJson !== undefined ? options.superJson : superJson,
      {
        fileSystemOverride: {
          path: {
            resolve: (...pathSegments: string[]) => pathSegments.join(),
          },
          readFile: (
            path: string
          ): Promise<Result<string, FileSystemError>> => {
            if (
              options?.profileAstPath !== undefined &&
              !path.includes(options.profileAstPath)
            ) {
              return Promise.resolve(err(new NotFoundError('File not found')));
            }

            return Promise.resolve(
              ok(
                JSON.stringify(
                  options?.ast !== undefined
                    ? options.ast
                    : firstMockProfileDocument
                )
              )
            );
          },
        },
        configOverride: options?.config,
      }
    );
  };

  // Without retry policy
  it('does not use retry policy - returns after HTTP 200', async () => {
    const endpoint = await mockServer.forGet('/first').thenJson(200, {}, { Connection });
    const client = createMockClient();
    client.addBoundProfileProvider(
      firstMockProfileDocument,
      firstMockMapDocument,
      'provider',
      mockServer.url
    );

    // Run it as usual
    const profile = await client.getProfile('starwars/character-information');
    const useCase = profile.getUseCase('Test');
    const provider = new Provider(new ProviderConfiguration('provider', []));
    const result = await useCase.perform(undefined, { provider });

    expect(result.isOk() && result.value).toEqual({ message: 'hello' });
    expect((await endpoint.getSeenRequests()).length).toEqual(1);
  });

  it('does not use retry policy - aborts after HTTP 500', async () => {
    const endpoint = await mockServer.forGet('/first').thenJson(500, {}, { Connection });
    const client = createMockClient();

    client.addBoundProfileProvider(
      firstMockProfileDocument,
      firstMockMapDocument,
      'provider',
      mockServer.url
    );

    const profile = await client.getProfile('starwars/character-information');
    const useCase = profile.getUseCase('Test');
    const provider = new Provider(new ProviderConfiguration('provider', []));
    const result = useCase.perform(undefined, { provider });

    await expect(result).rejects.toThrow(/status code: 500/);

    expect((await endpoint.getSeenRequests()).length).toEqual(1);
  });

  it('does not use retry policy - aborts after closed connection', async () => {
    await mockServer.forGet('/first').thenCloseConnection();
    const client = createMockClient();

    client.addBoundProfileProvider(
      firstMockProfileDocument,
      firstMockMapDocument,
      'provider',
      mockServer.url
    );

    const profile = await client.getProfile('starwars/character-information');
    const useCase = profile.getUseCase('Test');
    const provider = new Provider(new ProviderConfiguration('provider', []));
    const result = useCase.perform(undefined, { provider });

    await expect(result).rejects.toThrow(/network error/);
  });

  it('does not use retry policy - aborts after timeout', async () => {
    await mockServer.forGet('/first').thenTimeout();
    const client = createMockClient();

    client.addBoundProfileProvider(
      firstMockProfileDocument,
      firstMockMapDocument,
      'provider',
      mockServer.url
    );
    const profile = await client.getProfile('starwars/character-information');
    const useCase = profile.getUseCase('Test');
    const provider = new Provider(new ProviderConfiguration('provider', []));
    const result = useCase.perform(undefined, { provider });
    setImmediate(() => client.timers.tick(300000));

    await expect(result).rejects.toThrow(/timeout/);
  });

  // Circuit breaker
  it('use circuit-breaker policy - aborts after HTTP 500', async () => {
    const endpoint = await mockServer.forGet('/first').thenJson(500, {}, { Connection });
    const superJson = normalizeSuperJsonDocument(
      {
        profiles: {
          ['starwars/character-information']: {
            version: '1.0.0',
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
      },
      new MockEnvironment()
    );

    const client = createMockClient({ superJson });
    client.addBoundProfileProvider(
      firstMockProfileDocument,
      firstMockMapDocument,
      'provider',
      mockServer.url
    );

    const profile = await client.getProfile('starwars/character-information');
    const useCase = profile.getUseCase('Test');
    const provider = await client.getProvider('provider');
    const result = useCase.perform(undefined, { provider });

    await expect(result).rejects.toThrow(/status code: 500/);

    // We send request twice
    expect((await endpoint.getSeenRequests()).length).toEqual(2);
  });

  it('use circuit-breaker policy with backoff - aborts after HTTP 500', async () => {
    const backoffTime = 5000;
    let firstRequestTime: number | undefined;
    let secondRequestTime: number | undefined;

    let retry = true;
    const endpoint = await mockServer.forGet('/first').thenCallback(() => {
      if (retry) {
        retry = false;
        firstRequestTime = client.timers.now();

        return {
          statusCode: 500,
          json: {},
        };
      }
      secondRequestTime = client.timers.now();

      return {
        statusCode: 200,
        json: {},
        headers: {
          Connection
        }
      };
    });

    const superJson = normalizeSuperJsonDocument(
      {
        profiles: {
          ['starwars/character-information']: {
            version: '1.0.0',
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
      },
      new MockEnvironment()
    );

    const client = createMockClient({ superJson });
    client.addBoundProfileProvider(
      firstMockProfileDocument,
      firstMockMapDocument,
      'provider',
      mockServer.url
    );

    const profile = await client.getProfile('starwars/character-information');
    const useCase = profile.getUseCase('Test');
    const provider = await client.getProvider('provider');
    const result = await useCase.perform(undefined, { provider });

    expect(result.isOk() && result.value).toEqual({ message: 'hello' });

    // We waited because of backoff
    expect(secondRequestTime).toBeDefined();
    expect(firstRequestTime).toBeDefined();
    // Two is default exponent for ExponentialBackoff
    expect(secondRequestTime! - firstRequestTime!).toBeGreaterThanOrEqual(
      2 * backoffTime
    );
    // We send request twice
    expect((await endpoint.getSeenRequests()).length).toEqual(2);
  });

  it('use circuit-breaker policy - switch providers after HTTP 500, using default provider', async () => {
    const endpoint = await mockServer.forGet('/first').thenJson(500, {}, { Connection });
    const secondEndpoint = await mockServer.forGet('/second').thenJson(200, {}, { Connection });
    const superJson = normalizeSuperJsonDocument(
      {
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
      },
      new MockEnvironment()
    );

    const client = createMockClient({ superJson });

    client.addBoundProfileProvider(
      firstMockProfileDocument,
      firstMockMapDocument,
      'provider',
      mockServer.url
    );
    client.addBoundProfileProvider(
      firstMockProfileDocument,
      secondMockMapDocument,
      'second',
      mockServer.url
    );

    const profile = await client.getProfile('starwars/character-information');
    const useCase = profile.getUseCase('Test');
    const result = await useCase.perform(undefined);

    expect(result.isOk() && result.value).toEqual({
      message: 'hello from second provider',
    });
    // We send request twice
    expect((await endpoint.getSeenRequests()).length).toEqual(2);
    expect((await secondEndpoint.getSeenRequests()).length).toEqual(1);
  });

  it('use circuit-breaker policy - do not switch providers after HTTP 500 - using provider from user', async () => {
    const endpoint = await mockServer.forGet('/first').thenJson(500, {}, { Connection });
    const secondEndpoint = await mockServer.forGet('/second').thenJson(200, {}, { Connection });
    const superJson = normalizeSuperJsonDocument(
      {
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
      },
      new MockEnvironment()
    );

    const client = createMockClient({ superJson });

    client.addBoundProfileProvider(
      firstMockProfileDocument,
      firstMockMapDocument,
      'provider',
      mockServer.url
    );
    client.addBoundProfileProvider(
      firstMockProfileDocument,
      secondMockMapDocument,
      'second',
      mockServer.url
    );

    const profile = await client.getProfile('starwars/character-information');
    const useCase = profile.getUseCase('Test');
    const result = useCase.perform(undefined, { provider: 'provider' });

    await expect(result).rejects.toThrow(/status code: 500/);

    expect((await endpoint.getSeenRequests()).length).toEqual(2);
    expect((await secondEndpoint.getSeenRequests()).length).toEqual(0);
  });

  it('use circuit-breaker policy - do not switch providers after HTTP 500, providerFailover is false', async () => {
    const endpoint = await mockServer.forGet('/first').thenJson(500, {}, { Connection });
    const secondEndpoint = await mockServer.forGet('/second').thenJson(200, {}, { Connection });
    const superJson = normalizeSuperJsonDocument(
      {
        profiles: {
          ['starwars/character-information']: {
            version: '1.0.0',
            defaults: {
              Test: {
                providerFailover: false,
              },
            },
            // Set
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
      },
      new MockEnvironment()
    );

    const client = createMockClient({ superJson });

    client.addBoundProfileProvider(
      firstMockProfileDocument,
      firstMockMapDocument,
      'provider',
      mockServer.url
    );
    client.addBoundProfileProvider(
      firstMockProfileDocument,
      secondMockMapDocument,
      'second',
      mockServer.url
    );

    const profile = await client.getProfile('starwars/character-information');
    const useCase = profile.getUseCase('Test');
    const result = useCase.perform(undefined);

    await expect(result).rejects.toThrow(/No backup provider available/);

    // We send request twice - to the first provider url
    expect((await endpoint.getSeenRequests()).length).toEqual(2);
    expect((await secondEndpoint.getSeenRequests()).length).toEqual(0);
  });

  it('use circuit-breaker policy - switch providers after HTTP 500, use implict priority array', async () => {
    const endpoint = await mockServer.forGet('/first').thenJson(500, {}, { Connection });
    const secondEndpoint = await mockServer.forGet('/second').thenJson(200, {}, { Connection });
    const superJson = normalizeSuperJsonDocument(
      {
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
      },
      new MockEnvironment()
    );

    const client = createMockClient({ superJson });

    client.addBoundProfileProvider(
      firstMockProfileDocument,
      firstMockMapDocument,
      'provider',
      mockServer.url
    );
    client.addBoundProfileProvider(
      firstMockProfileDocument,
      secondMockMapDocument,
      'second',
      mockServer.url
    );

    const profile = await client.getProfile('starwars/character-information');
    const useCase = profile.getUseCase('Test');
    const result = await useCase.perform(undefined);

    expect(result.isOk() && result.value).toEqual({
      message: 'hello from second provider',
    });
    // We send request twice - to the first provider url
    expect((await endpoint.getSeenRequests()).length).toEqual(2);
    expect((await secondEndpoint.getSeenRequests()).length).toEqual(1);
  });

  it('use two circuit-breaker policies - switch providers after HTTP 500', async () => {
    const endpoint = await mockServer.forGet('/first').thenJson(500, {}, { Connection });
    const secondEndpoint = await mockServer.forGet('/second').thenJson(200, {}, { Connection });
    const superJson = normalizeSuperJsonDocument(
      {
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
      },
      new MockEnvironment()
    );

    const client = createMockClient({ superJson });

    client.addBoundProfileProvider(
      firstMockProfileDocument,
      firstMockMapDocument,
      'provider',
      mockServer.url
    );
    client.addBoundProfileProvider(
      firstMockProfileDocument,
      secondMockMapDocument,
      'second',
      mockServer.url
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

    // We send request twice - to the first provider url
    expect((await endpoint.getSeenRequests()).length).toEqual(2);
    expect((await secondEndpoint.getSeenRequests()).length).toEqual(2);
  });

  it('use circuit-breaker policy - switch providers after HTTP 500 and switch back - default provider', async () => {
    let endpointCalls = 0;
    const endpoint = await mockServer.forGet('/first').thenCallback(() => {
      endpointCalls += 1;

      if (endpointCalls > 2) {
        return { statusCode: 200, json: {}, headers: { Connection } };
      } else {
        return { statusCode: 500, json: {}, headers: { Connection } };
      }
    });
    const secondEndpoint = await mockServer.forGet('/second').thenJson(200, {}, { Connection });

    const superJson = normalizeSuperJsonDocument(
      {
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
      },
      new MockEnvironment()
    );

    const client = createMockClient({ superJson });

    client.addBoundProfileProvider(
      firstMockProfileDocument,
      firstMockMapDocument,
      'provider',
      mockServer.url
    );
    client.addBoundProfileProvider(
      firstMockProfileDocument,
      secondMockMapDocument,
      'second',
      mockServer.url
    );

    const profile = await client.getProfile('starwars/character-information');
    const useCase = profile.getUseCase('Test');
    // Try first provider two times then switch to second and return value
    let result = await useCase.perform(undefined);

    expect(result.isOk() && result.value).toEqual({
      message: 'hello from second provider',
    });

    client.timers.tick(30000);

    // Try first provider and return value
    result = await useCase.perform(undefined);

    expect(result.isOk() && result.value).toEqual({ message: 'hello' });
    // We send request twice
    expect((await endpoint.getSeenRequests()).length).toEqual(3);
    expect((await secondEndpoint.getSeenRequests()).length).toEqual(1);
  });

  it('use circuit-breaker policy - switch providers after HTTP 500 and perform another usecase', async () => {
    let endpointCalls = 0;
    const endpoint = await mockServer.forGet('/first').thenCallback(() => {
      endpointCalls += 1;

      if (endpointCalls > 2) {
        return { statusCode: 200, json: {} };
      } else {
        return { statusCode: 500, json: {} };
      }
    });
    const secondEndpoint = await mockServer.forGet('/second').thenJson(200, {}, { Connection });

    const superJson = normalizeSuperJsonDocument(
      {
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
      },
      new MockEnvironment()
    );

    const client = createMockClient({ superJson });

    client.addBoundProfileProvider(
      firstMockProfileDocument,
      firstMockMapDocument,
      'provider',
      mockServer.url
    );
    client.addBoundProfileProvider(
      firstMockProfileDocument,
      secondMockMapDocument,
      'second',
      mockServer.url
    );

    const profile = await client.getProfile('starwars/character-information');
    let useCase = profile.getUseCase('Test');
    // Try first provider two times then switch to second and return value
    let result = await useCase.perform(undefined);

    expect(result.isOk() && result.value).toEqual({
      message: 'hello from second provider',
    });

    // Try first provider second usecase and return value
    useCase = profile.getUseCase('SecondUseCase');
    result = await useCase.perform(undefined);

    expect(result.isOk() && result.value).toEqual({
      message: 'hello from first provider and second usecase',
    });
    // We send request twice
    expect((await endpoint.getSeenRequests()).length).toEqual(3);
    expect((await secondEndpoint.getSeenRequests()).length).toEqual(1);
  });

  it('use circuit-breaker policy - switch providers after HTTP 500, perform another usecase and switch profile', async () => {
    let endpointCalls = 0;
    const endpoint = await mockServer.forGet('/first').thenCallback(() => {
      endpointCalls += 1;

      if (endpointCalls > 2) {
        return { statusCode: 200, json: {}, headers: { Connection } };
      } else {
        return { statusCode: 500, json: {}, headers: { Connection } };
      }
    });
    const secondEndpoint = await mockServer.forGet('/second').thenJson(200, {}, { Connection });
    const thirdEndpoint = await mockServer.forGet('/third').thenJson(200, {}, { Connection });

    const superJson = normalizeSuperJsonDocument(
      {
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
      },
      new MockEnvironment()
    );

    const client = new MockClient(superJson, {
      fileSystemOverride: {
        readFile: jest
          .fn()
          .mockImplementationOnce(() =>
            Promise.resolve(ok(JSON.stringify(firstMockProfileDocument)))
          )
          .mockImplementationOnce(() =>
            Promise.resolve(ok(JSON.stringify(secondMockProfileDocument)))
          ),
      },
    });
    client.addBoundProfileProvider(
      firstMockProfileDocument,
      firstMockMapDocument,
      'provider',
      mockServer.url
    );
    client.addBoundProfileProvider(
      firstMockProfileDocument,
      secondMockMapDocument,
      'second',
      mockServer.url
    );
    client.addBoundProfileProvider(
      secondMockProfileDocument,
      thirdMockMapDocument,
      'third',
      mockServer.url
    );

    const profile = await client.getProfile('starwars/character-information');
    let useCase = profile.getUseCase('Test');
    // Try first provider two times then switch to second and return value
    let result = await useCase.perform(undefined);

    expect(result.isOk() && result.value).toEqual({
      message: 'hello from second provider',
    });

    // Try first provider second usecase and return value
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
    expect((await secondEndpoint.getSeenRequests()).length).toEqual(1);
    expect((await thirdEndpoint.getSeenRequests()).length).toEqual(1);
  });

  it('use circuit-breaker policy - switch providers after HTTP 500, using provider from user and abort policy', async () => {
    const endpoint = await mockServer.forGet('/first').thenJson(500, {}, { Connection });
    const secondEndpoint = await mockServer.forGet('/second').thenJson(200, {}, { Connection });

    const superJson = normalizeSuperJsonDocument(
      {
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
      },
      new MockEnvironment()
    );

    const client = createMockClient({ superJson });

    client.addBoundProfileProvider(
      firstMockProfileDocument,
      firstMockMapDocument,
      'provider',
      mockServer.url
    );
    client.addBoundProfileProvider(
      firstMockProfileDocument,
      secondMockMapDocument,
      'second',
      mockServer.url
    );

    const profile = await client.getProfile('starwars/character-information');
    const useCase = profile.getUseCase('Test');
    const result = await useCase.perform(undefined);

    expect(result.isOk() && result.value).toEqual({
      message: 'hello from second provider',
    });
    // We send request twice
    expect((await endpoint.getSeenRequests()).length).toEqual(1);
    expect((await secondEndpoint.getSeenRequests()).length).toEqual(1);
  });

  /**
   * Bind
   */
  it('use abort policy - switch providers after error in bind', async () => {
    const endpoint = await mockServer.forGet('/first').thenJson(200, {}, { Connection });
    const bindEndpoint = await mockServer
      .forPost('/registry/bind')
      .thenJson(400, {
        detail: 'Invalid request',
        title: 'test',
      }, { Connection });

    const superJson = normalizeSuperJsonDocument(
      {
        profiles: {
          ['starwars/character-information']: {
            version: '1.0.0',
            defaults: {
              Test: {
                providerFailover: true,
              },
            },
            priority: ['invalid', 'provider'],
            providers: {
              provider: {
                defaults: {
                  Test: {
                    input: {},
                    retryPolicy: OnFail.NONE,
                  },
                },
              },
              invalid: {
                defaults: {
                  Test: {
                    input: {},
                    retryPolicy: OnFail.NONE,
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
          invalid: {
            security: [],
          },
        },
      },
      new MockEnvironment()
    );

    const client = createMockClient({
      profileAstPath: 'starwars/character-information@1.0.0.supr.ast.json',
      superJson,
      config: {
        superfaceApiUrl: mockServer.url,
      },
    });
    client.addBoundProfileProvider(
      firstMockProfileDocument,
      firstMockMapDocument,
      'provider',
      mockServer.url
    );

    const profile = await client.getProfile('starwars/character-information');
    const useCase = profile.getUseCase('Test');
    const result = await useCase.perform(undefined);

    expect(result.isOk() && result.value).toEqual({
      message: 'hello',
    });
    expect((await endpoint.getSeenRequests()).length).toEqual(1);
    expect((await bindEndpoint.getSeenRequests()).length).toEqual(1);
  });

  it('use default policy - switch providers after error in bind', async () => {
    const endpoint = await mockServer.forGet('/first').thenJson(200, {}, { Connection });
    const bindEndpoint = await mockServer
      .forPost('/registry/bind')
      .thenJson(400, {
        detail: 'Invalid request',
        title: 'test',
      }, { Connection });

    const superJson = normalizeSuperJsonDocument(
      {
        profiles: {
          ['starwars/character-information']: {
            version: '1.0.0',
            defaults: {
              Test: {
                providerFailover: true,
              },
            },
            priority: ['invalid', 'provider'],
            providers: {
              provider: {
                defaults: {
                  Test: {
                    input: {},
                  },
                },
              },
              invalid: {
                defaults: {
                  Test: {
                    input: {},
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
          invalid: {
            security: [],
          },
        },
      },
      new MockEnvironment()
    );

    const client = createMockClient({
      profileAstPath: 'starwars/character-information@1.0.0.supr.ast.json',
      superJson,
      config: {
        superfaceApiUrl: mockServer.url,
      },
    });

    client.addBoundProfileProvider(
      firstMockProfileDocument,
      firstMockMapDocument,
      'provider',
      mockServer.url
    );

    const profile = await client.getProfile('starwars/character-information');
    const useCase = profile.getUseCase('Test');
    const result = await useCase.perform(undefined);

    expect(result.isOk() && result.value).toEqual({
      message: 'hello',
    });
    expect((await endpoint.getSeenRequests()).length).toEqual(1);
    expect((await bindEndpoint.getSeenRequests()).length).toEqual(1);
  });

  it('use default policy - fail after error in bind', async () => {
    const endpoint = await mockServer.forGet('/first').thenJson(200, {}, { Connection });
    const bindEndpoint = await mockServer
      .forPost('/registry/bind')
      .thenJson(400, {
        detail: 'Invalid request',
        title: 'test',
      }, { Connection });

    const superJson = normalizeSuperJsonDocument(
      {
        profiles: {
          ['starwars/character-information']: {
            version: '1.0.0',
            defaults: {
              Test: {
                providerFailover: false,
              },
            },
            priority: ['invalid', 'provider'],
            providers: {
              provider: {
                defaults: {
                  Test: {
                    input: {},
                  },
                },
              },
              invalid: {
                defaults: {
                  Test: {
                    input: {},
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
          invalid: {
            security: [],
          },
        },
      },
      new MockEnvironment()
    );

    const client = createMockClient({
      profileAstPath: 'starwars/character-information@1.0.0.supr.ast.json',
      superJson,
      config: {
        superfaceApiUrl: mockServer.url,
      },
    });

    const profile = await client.getProfile('starwars/character-information');
    const useCase = profile.getUseCase('Test');
    const result = useCase.perform(undefined);

    await expect(result).rejects.toThrow(
      bindResponseError({
        statusCode: 400,
        profileId: 'starwars/character-information@1.0.0',
        provider: 'invalid',
        title: 'test',
        detail: 'Invalid request',
        apiUrl: mockServer.url,
      })
    );

    expect((await endpoint.getSeenRequests()).length).toEqual(0);
    expect((await bindEndpoint.getSeenRequests()).length).toEqual(1);
  });

  it('use circuit breaker policy - switch providers after error in bind', async () => {
    const endpoint = await mockServer.forGet('/first').thenJson(200, {}, { Connection });
    const bindEndpoint = await mockServer
      .forPost('/registry/bind')
      .thenJson(400, {
        detail: 'Invalid request',
        title: 'test',
      }, { Connection });

    const superJson = normalizeSuperJsonDocument(
      {
        profiles: {
          ['starwars/character-information']: {
            version: '1.0.0',
            defaults: {
              Test: {
                providerFailover: true,
              },
            },
            priority: ['invalid', 'provider'],
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
              invalid: {
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
          invalid: {
            security: [],
          },
        },
      },
      new MockEnvironment()
    );

    const client = createMockClient({
      profileAstPath: 'starwars/character-information@1.0.0.supr.ast.json',
      superJson,
      config: {
        superfaceApiUrl: mockServer.url,
      },
    });

    client.addBoundProfileProvider(
      firstMockProfileDocument,
      firstMockMapDocument,
      'provider',
      mockServer.url
    );

    const profile = await client.getProfile('starwars/character-information');
    const useCase = profile.getUseCase('Test');
    const result = await useCase.perform(undefined);

    expect(result.isOk() && result.value).toEqual({
      message: 'hello',
    });

    expect((await endpoint.getSeenRequests()).length).toEqual(1);
    expect((await bindEndpoint.getSeenRequests()).length).toEqual(1);
  });

  it('preserves hook context within one client', async () => {
    const endpoint = await mockServer.forGet('/first').thenJson(500, {}, { Connection });
    const secondEndpoint = await mockServer.forGet('/second').thenJson(200, {}, { Connection });
    const superJson = normalizeSuperJsonDocument(
      {
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
      },
      new MockEnvironment()
    );

    const client = createMockClient({ superJson });

    client.addBoundProfileProvider(
      firstMockProfileDocument,
      firstMockMapDocument,
      'provider',
      mockServer.url
    );
    client.addBoundProfileProvider(
      firstMockProfileDocument,
      secondMockMapDocument,
      'second',
      mockServer.url
    );

    let result = await (
      await client.getProfile('starwars/character-information')
    )
      .getUseCase('Test')
      .perform(undefined);
    if (result.isErr()) {
      console.error(result.error);
    }
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
    const endpoint = await mockServer.forGet('/first').thenJson(500, {}, { Connection });
    const secondEndpoint = await mockServer.forGet('/second').thenJson(200, {}, { Connection });
    const superJson = normalizeSuperJsonDocument(
      {
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
                      backoff: {
                        kind: BackoffKind.EXPONENTIAL,
                        start: 50,
                      },
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
                      backoff: {
                        kind: BackoffKind.EXPONENTIAL,
                        start: 50,
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
          second: {
            security: [],
          },
        },
      },
      new MockEnvironment()
    );

    {
      const client = createMockClient({ superJson });

      client.addBoundProfileProvider(
        firstMockProfileDocument,
        firstMockMapDocument,
        'provider',
        mockServer.url
      );
      client.addBoundProfileProvider(
        firstMockProfileDocument,
        secondMockMapDocument,
        'second',
        mockServer.url
      );

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
      const client = createMockClient({ superJson });

      client.addBoundProfileProvider(
        firstMockProfileDocument,
        firstMockMapDocument,
        'provider',
        mockServer.url
      );
      client.addBoundProfileProvider(
        firstMockProfileDocument,
        secondMockMapDocument,
        'second',
        mockServer.url
      );

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
