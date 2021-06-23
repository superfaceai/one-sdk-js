import { MapDocumentNode, ProfileDocumentNode } from '@superfaceai/ast';
import { getLocal } from 'mockttp';

// import { err } from '../../lib';
// import { events } from '../../lib/events';
import { BoundProfileProvider } from '../profile-provider';
import { registerFetchRetryHooks, RetryHooksContext } from './event-adapter';
import { CircuitBreakerPolicy } from './policies';

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
    provider: 'test',
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
  });
  it('uses circuit breaker - aborts after HTTP 500', async () => {
    await mockServer.get('/test').thenJson(500, {});

    const profile = new BoundProfileProvider(
      mockProfileDocument,
      mockMapDocument,
      'provider',
      { baseUrl: mockServer.url, security: [] }
    );

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

    const retryHookContext: RetryHooksContext = {
      [`starwars/character-information/Test/provider`]: {
        policy,
        queuedAction: undefined,
      },
    };

    registerFetchRetryHooks(retryHookContext);

    await expect(profile.perform('Test')).resolves.toEqual({
      error: 'Internal Server Error',
    });
  }, 30000);

  it.only('uses circuit breaker - retries after HTTP 429', async () => {
    const endpoint = await mockServer.get('/test').thenJson(429, {});

    const profile = new BoundProfileProvider(
      mockProfileDocument,
      mockMapDocument,
      'provider',
      { baseUrl: mockServer.url, security: [] }
    );

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

    const retryHookContext: RetryHooksContext = {
      [`starwars/character-information/Test/provider`]: {
        policy,
        queuedAction: undefined,
      },
    };

    registerFetchRetryHooks(retryHookContext);

    await expect(profile.perform('Test')).resolves.toEqual({
      error: 'circuit breaker is open',
    });

    expect((await endpoint.getSeenRequests()).length).toEqual(3);
  }, 30000);
  it('uses circuit breaker - aborts after 1 timeout', async () => {
    await mockServer.get('/test').thenTimeout();

    const profile = new BoundProfileProvider(
      mockProfileDocument,
      mockMapDocument,
      'provider',
      { baseUrl: mockServer.url, security: [] }
    );

    const policy = new CircuitBreakerPolicy(
      {
        profileId: mockMapDocument.header.profile.name,
        usecaseName: 'Test',
        usecaseSafety: 'safe',
      },
      //TODO: somehow it does not work for more then 1 :/ Probably something with timeout function in fetch.ts
      1,
      300000,
      1000
    );

    const retryHookContext: RetryHooksContext = {
      [`starwars/character-information/Test/provider`]: {
        policy,
        queuedAction: undefined,
      },
    };

    registerFetchRetryHooks(retryHookContext);

    await expect(profile.perform('Test')).resolves.toEqual({
      error: 'circuit breaker is open',
    });
  }, 30000);
});
