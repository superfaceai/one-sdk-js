import { MapDocumentNode, ProfileDocumentNode } from '@superfaceai/ast';
import { getLocal } from 'mockttp';

import { OnFail, SuperJson } from '../../internal';
import { err, ok } from '../../lib';
import { SuperfaceClient } from '../client';
import { Profile, ProfileConfiguration } from '../profile';
import { BoundProfileProvider } from '../profile-provider';
import { Provider, ProviderConfiguration } from '../provider';
import { UseCase } from '../usecase';
import { HooksContext, registerHooks } from './event-adapter';
import { CircuitBreakerPolicy, Router } from './policies';

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

const mockServer = getLocal();

describe('event-adapter', () => {
  beforeEach(async () => {
    await mockServer.start();
  });

  afterEach(async () => {
    await mockServer.stop();
    jest.resetAllMocks();
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
      { baseUrl: mockServer.url, security: [] }
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
      { baseUrl: mockServer.url, security: [] }
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

  it.only('use circuit-breaker policy - aborts after HTTP 500', async () => {
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
      { baseUrl: mockServer.url, security: [] }
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

  it('use circuit-breaker policy - switch providers after HTTP 500', async () => {
    const endpoint = await mockServer.get('/test').thenJson(500, {});

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

    //Mocking bounded provider
    const mockBoundProfileProvider = new BoundProfileProvider(
      mockProfileDocument,
      mockMapDocument,
      'provider',
      { baseUrl: mockServer.url, security: [] }
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

  //OLD

  it.skip('uses circuit breaker - retries after HTTP 429', async () => {
    const endpoint = await mockServer.get('/test').thenJson(429, {});

    const mockBoundProfileProvider = new BoundProfileProvider(
      mockProfileDocument,
      mockMapDocument,
      'provider',
      { baseUrl: mockServer.url, security: [] }
    );
    const mockClient = new SuperfaceClient();

    const mockProfileConfiguration = new ProfileConfiguration(
      'starwars/character-information',
      '1.0.0'
    );
    const mockProfile = new Profile(mockClient, mockProfileConfiguration);

    const mockProviderConfiguration = new ProviderConfiguration('provider', []);
    const mockProvider = new Provider(mockClient, mockProviderConfiguration);

    const getProviderForProfileSpy = jest
      .spyOn(mockClient, 'getProviderForProfile')
      .mockResolvedValue(mockProvider);
    const cacheBoundProfileProviderSpy = jest
      .spyOn(mockClient, 'cacheBoundProfileProvider')
      .mockResolvedValue(mockBoundProfileProvider);

    const usecase = new UseCase(mockProfile, 'Test');

    const policy = new CircuitBreakerPolicy(
      {
        profileId: mockMapDocument.header.profile.name,
        usecaseName: 'Test',
        usecaseSafety: 'safe',
      },
      3,
      300000,
      1000
    );

    const retryHookContext: HooksContext = {
      [`starwars/character-information/Test`]: {
        //Empty priority array
        router: new Router({ ['provider']: policy }, [], 'provider'),
        queuedAction: undefined,
      },
    };

    registerHooks(retryHookContext);

    await expect(usecase.perform()).resolves.toEqual(
      err('circuit breaker is open')
    );

    expect(getProviderForProfileSpy).toHaveBeenCalledTimes(1);
    expect(getProviderForProfileSpy).toHaveBeenCalledWith(
      'starwars/character-information'
    );

    expect(cacheBoundProfileProviderSpy).toHaveBeenCalledTimes(1);
    expect(cacheBoundProfileProviderSpy).toHaveBeenCalledWith(
      mockProfileConfiguration,
      mockProviderConfiguration
    );

    expect((await endpoint.getSeenRequests()).length).toEqual(3);
  }, 30000);

  it.skip('uses circuit breaker - aborts after 1 timeout', async () => {
    await mockServer.get('/test').thenTimeout();

    const mockBoundProfileProvider = new BoundProfileProvider(
      mockProfileDocument,
      mockMapDocument,
      'provider',
      { baseUrl: mockServer.url, security: [] }
    );
    const mockClient = new SuperfaceClient();

    const mockProfileConfiguration = new ProfileConfiguration(
      'starwars/character-information',
      '1.0.0'
    );
    const mockProfile = new Profile(mockClient, mockProfileConfiguration);

    const mockProviderConfiguration = new ProviderConfiguration('provider', []);
    const mockProvider = new Provider(mockClient, mockProviderConfiguration);

    const getProviderForProfileSpy = jest
      .spyOn(mockClient, 'getProviderForProfile')
      .mockResolvedValue(mockProvider);
    const cacheBoundProfileProviderSpy = jest
      .spyOn(mockClient, 'cacheBoundProfileProvider')
      .mockResolvedValue(mockBoundProfileProvider);

    const usecase = new UseCase(mockProfile, 'Test');

    const policy = new CircuitBreakerPolicy(
      {
        profileId: mockMapDocument.header.profile.name,
        usecaseName: 'Test',
        usecaseSafety: 'safe',
      },
      1,
      300000,
      1000
    );

    const retryHookContext: HooksContext = {
      [`starwars/character-information/Test`]: {
        //Empty priority array
        router: new Router({ ['provider']: policy }, [], 'provider'),
        queuedAction: undefined,
      },
    };

    registerHooks(retryHookContext);

    await expect(usecase.perform()).resolves.toEqual(
      err('circuit breaker is open')
    );

    expect(getProviderForProfileSpy).toHaveBeenCalledTimes(1);
    expect(getProviderForProfileSpy).toHaveBeenCalledWith(
      'starwars/character-information'
    );

    expect(cacheBoundProfileProviderSpy).toHaveBeenCalledTimes(1);
    expect(cacheBoundProfileProviderSpy).toHaveBeenCalledWith(
      mockProfileConfiguration,
      mockProviderConfiguration
    );
  }, 30000);

  it.skip('uses failover policy - retruns result on 200', async () => {
    const endpoint = await mockServer.get('/test').thenJson(200, {});

    const mockBoundProfileProvider = new BoundProfileProvider(
      mockProfileDocument,
      mockMapDocument,
      'provider',
      { baseUrl: mockServer.url, security: [] }
    );
    const mockClient = new SuperfaceClient();

    const mockProfileConfiguration = new ProfileConfiguration(
      'starwars/character-information',
      '1.0.0'
    );
    const mockProfile = new Profile(mockClient, mockProfileConfiguration);

    const mockProviderConfiguration = new ProviderConfiguration('provider', []);
    const mockProvider = new Provider(mockClient, mockProviderConfiguration);

    const getProviderForProfileSpy = jest
      .spyOn(mockClient, 'getProviderForProfile')
      .mockResolvedValue(mockProvider);
    const cacheBoundProfileProviderSpy = jest
      .spyOn(mockClient, 'cacheBoundProfileProvider')
      .mockResolvedValue(mockBoundProfileProvider);

    const usecase = new UseCase(mockProfile, 'Test');

    const policy = new CircuitBreakerPolicy(
      {
        profileId: mockMapDocument.header.profile.name,
        usecaseName: 'Test',
        usecaseSafety: 'safe',
      },
      3,
      300000,
      1000
    );

    const retryHookContext: HooksContext = {
      [`starwars/character-information/Test`]: {
        router: new Router({ ['provider']: policy }, ['provider'], 'provider'),
        queuedAction: undefined,
      },
    };

    registerHooks(retryHookContext);

    await expect(usecase.perform()).resolves.toEqual(ok({ message: 'hello' }));

    expect(getProviderForProfileSpy).toHaveBeenCalledTimes(1);
    expect(getProviderForProfileSpy).toHaveBeenCalledWith(
      'starwars/character-information'
    );

    expect(cacheBoundProfileProviderSpy).toHaveBeenCalledTimes(1);
    expect(cacheBoundProfileProviderSpy).toHaveBeenCalledWith(
      mockProfileConfiguration,
      mockProviderConfiguration
    );

    const seen = (await endpoint.getSeenRequests()).length;
    expect(seen).toEqual(1);
  }, 30000);

  it.skip('uses failover policy', async () => {
    const endpoint = await mockServer.get('/test').thenJson(500, {});

    const mockBoundProfileProvider = new BoundProfileProvider(
      mockProfileDocument,
      mockMapDocument,
      'provider',
      { baseUrl: mockServer.url, security: [] }
    );
    const mockClient = new SuperfaceClient();

    const mockProfileConfiguration = new ProfileConfiguration(
      'starwars/character-information',
      '1.0.0'
    );
    const mockProfile = new Profile(mockClient, mockProfileConfiguration);

    const mockProviderConfiguration = new ProviderConfiguration('provider', []);
    const mockProvider = new Provider(mockClient, mockProviderConfiguration);

    const getProviderForProfileSpy = jest
      .spyOn(mockClient, 'getProviderForProfile')
      .mockResolvedValue(mockProvider);
    const cacheBoundProfileProviderSpy = jest
      .spyOn(mockClient, 'cacheBoundProfileProvider')
      .mockResolvedValue(mockBoundProfileProvider);

    const usecase = new UseCase(mockProfile, 'Test');

    const policy = new CircuitBreakerPolicy(
      {
        profileId: mockMapDocument.header.profile.name,
        usecaseName: 'Test',
        usecaseSafety: 'safe',
      },
      1,
      300000,
      1000
    );

    const retryHookContext: HooksContext = {
      [`starwars/character-information/Test`]: {
        router: new Router(
          { ['provider']: policy },
          ['provider', 'second'],
          'provider'
        ),
        queuedAction: undefined,
      },
    };

    registerHooks(retryHookContext);

    await expect(
      usecase.perform(undefined, { provider: mockProvider })
    ).resolves.toEqual(ok({ message: 'hello' }));

    expect(getProviderForProfileSpy).toHaveBeenCalledTimes(1);
    expect(getProviderForProfileSpy).toHaveBeenCalledWith(
      'starwars/character-information'
    );

    expect(cacheBoundProfileProviderSpy).toHaveBeenCalledTimes(1);
    expect(cacheBoundProfileProviderSpy).toHaveBeenCalledWith(
      mockProfileConfiguration,
      mockProviderConfiguration
    );

    const seen = (await endpoint.getSeenRequests()).length;
    expect(seen).toEqual(3);
  }, 30000);
});
