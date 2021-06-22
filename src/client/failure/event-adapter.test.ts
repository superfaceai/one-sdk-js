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

  it('uses set circuit breaker', async () => {
    const endpoint = await mockServer.get('/test').thenTimeout()//.thenJson(500, {});

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
        // TODO: Somehow know safety
        usecaseSafety: 'safe',
      },
      //TODO are these defauts ok?
      5,
      300000,
      10000,
    )

    const retryHookContext: RetryHooksContext = {
      [`starwars/character-information/Test/provider`]: { policy, queuedAction: undefined }
    };

    await registerFetchRetryHooks(retryHookContext)


    const result = await profile.perform('Test');
    console.log('res', result.unwrap())
    void result;
    const seenRequests = await endpoint.getSeenRequests();
    expect(seenRequests).toHaveLength(1);
  }, 20000);
});
