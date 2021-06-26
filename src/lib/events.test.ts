import { MapDocumentNode, ProfileDocumentNode } from '@superfaceai/ast';
import { getLocal } from 'mockttp';

import { BoundProfileProvider } from '../client';
import { Events } from './events';
import { err } from './result/result';

const mockProfileDocument: ProfileDocumentNode = {
  kind: 'ProfileDocument',
  header: {
    kind: 'ProfileHeader',
    scope: 'test',
    name: 'profile',
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

describe('events', () => {
  beforeEach(async () => {
    await mockServer.start();
  });

  afterEach(async () => {
    await mockServer.stop();
  });

  it('does something', async () => {
    const endpoint = await mockServer.get('/test').thenJson(200, {});
    const events = new Events();

    const profile = new BoundProfileProvider(
      mockProfileDocument,
      mockMapDocument,
      'provider',
      { baseUrl: mockServer.url, security: [] },
      events
    );

    let retry = true;
    events.on('post-fetch', { priority: 1 }, () => {
      if (retry) {
        retry = false;

        return { kind: 'retry' };
      }

      return { kind: 'continue' };
    });

    const result = await profile.perform('Test');
    void result;
    const seenRequests = await endpoint.getSeenRequests();
    expect(seenRequests).toHaveLength(2);
  });

  it('handles rejection', async () => {
    const events = new Events();
    const profile = new BoundProfileProvider(
      mockProfileDocument,
      mockMapDocument,
      'someprovider',
      { baseUrl: 'https://unreachable.localhost', security: [] },
      events
    );

    events.on(
      'post-fetch',
      { priority: 1 },
      async (_context, _args, result) => {
        try {
          await result;

          return { kind: 'continue' };
        } catch (e) {
          return {
            kind: 'modify',
            newResult: Promise.reject('modified rejection'),
          };
        }
      }
    );

    const result = await profile.perform('Test');
    expect(result).toStrictEqual(err('modified rejection'));
  });
});
