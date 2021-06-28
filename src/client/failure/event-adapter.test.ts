import { MapDocumentNode, ProfileDocumentNode } from '@superfaceai/ast';
import { getLocal } from 'mockttp';

import { OnFail, SuperJson } from '../../internal';
import { ok } from '../../lib';
import { SuperfaceClient } from '../client';
import { BoundProfileProvider } from '../profile-provider';

const mockLoadSyn = jest.fn();

const mockProfileDocument: ProfileDocumentNode = {
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
  ],
};

const mockMapDocument: MapDocumentNode = {
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
          url: '/test',
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
  ],
};

const mockServer = getLocal();

describe('event-adapter', () => {
  beforeEach(async () => {
    await mockServer.start();
  });

  afterEach(async () => {
    await mockServer.stop();
    jest.resetAllMocks();
    jest.resetModules();
  });

  it('does not use retry policy - returns after HTTP 200', async () => {
    const endpoint = await mockServer.get('/test').thenJson(200, {});

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

    mockLoadSyn.mockReturnValue(ok(mockSuperJson));
    SuperJson.loadSync = mockLoadSyn;

    //Not mocked client
    const client = new SuperfaceClient();

    //Mocking bounded provider
    const mockBoundProfileProvider = new BoundProfileProvider(
      mockProfileDocument,
      mockMapDocument,
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

    expect(result.unwrap()).toEqual({ message: 'hello' });
    expect((await endpoint.getSeenRequests()).length).toEqual(1);
    expect(cacheBoundProfileProviderSpy).toHaveBeenCalledTimes(1);
  }, 30000);

  it('does not use retry policy - aborts after HTTP 500', async () => {
    const endpoint = await mockServer.get('/test').thenJson(500, {});

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

    mockLoadSyn.mockReturnValue(ok(mockSuperJson));
    SuperJson.loadSync = mockLoadSyn;

    const client = new SuperfaceClient();

    //Mocking bounded provider
    const mockBoundProfileProvider = new BoundProfileProvider(
      mockProfileDocument,
      mockMapDocument,
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
  }, 30000);

  it('use circuit-breaker policy - aborts after HTTP 500', async () => {
    const endpoint = await mockServer.get('/test').thenJson(500, {});

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

    mockLoadSyn.mockReturnValue(ok(mockSuperJson));
    SuperJson.loadSync = mockLoadSyn;

    const client = new SuperfaceClient();

    //Mocking bounded provider
    const mockBoundProfileProvider = new BoundProfileProvider(
      mockProfileDocument,
      mockMapDocument,
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

    expect(() => result.unwrap()).toThrowError(
      new Error('circuit breaker is open')
    );
    //We send request twice
    expect((await endpoint.getSeenRequests()).length).toEqual(2);
    expect(cacheBoundProfileProviderSpy).toHaveBeenCalledTimes(1);
  }, 30000);

  it.only('use circuit-breaker policy - switch providers after HTTP 500', async () => {
    const endpoint = await mockServer.get('/test').thenJson(500, {});
    const secondEndpoint = await mockServer.get('/second').thenJson(200, {});

    const mockSuperJson = new SuperJson({
      profiles: {
        ['starwars/character-information']: {
          version: '1.0.0',
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

    mockLoadSyn.mockReturnValue(ok(mockSuperJson));
    SuperJson.loadSync = mockLoadSyn;

    const client = new SuperfaceClient();

    //Mocking first bounded provider
    const firstMockBoundProfileProvider = new BoundProfileProvider(
      mockProfileDocument,
      mockMapDocument,
      'provider',
      { baseUrl: mockServer.url, security: [] },
      client
    );
    //Mocking first bounded provider
    const secondMockBoundProfileProvider = new BoundProfileProvider(
      mockProfileDocument,
      secondMockMapDocument,
      'second',
      { baseUrl: mockServer.url, security: [] },
      client
    );
    const cacheBoundProfileProviderSpy = jest
      .spyOn(client, 'cacheBoundProfileProvider')
      .mockResolvedValueOnce(firstMockBoundProfileProvider)
      .mockResolvedValueOnce(secondMockBoundProfileProvider);

    const profile = await client.getProfile('starwars/character-information');
    const useCase = profile.getUseCase('Test');
    const result = await useCase.perform(undefined);

    expect(result.unwrap()).toEqual({ message: 'hello from second provider' });
    //We send request twice
    expect((await endpoint.getSeenRequests()).length).toEqual(2);
    expect(cacheBoundProfileProviderSpy).toHaveBeenCalledTimes(2);
    expect((await secondEndpoint.getSeenRequests()).length).toEqual(1);
  }, 30000);
});
