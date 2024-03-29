import type {
  AstMetadata,
  MapDocumentNode,
  ProfileDocumentNode,
  ProviderJson,
} from '@superfaceai/ast';
import { ApiKeyPlacement, HttpScheme, SecurityType } from '@superfaceai/ast';
import { getLocal } from 'mockttp';

import { err, UnexpectedError } from '../../lib';
import { MockTimers } from '../../mock';
import { NodeCrypto, NodeFetch, NodeFileSystem } from '../../node';
import { Config } from '../config';
import { BoundProfileProvider } from '../profile-provider';
import { PureJSSandbox } from '../sandbox';
import { ServiceSelector } from '../services';
import { Events } from './events';

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

const mockProfileDocument: ProfileDocumentNode = {
  kind: 'ProfileDocument',
  astMetadata,
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

const mockMapDocument: MapDocumentNode = {
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

const mockProviderJson = (name: string): ProviderJson => ({
  name,
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
});

const mockServer = getLocal();
const config = new Config(NodeFileSystem);
const sandbox = new PureJSSandbox();
const timers = new MockTimers();
const crypto = new NodeCrypto();

describe('events', () => {
  beforeEach(async () => {
    await mockServer.start();
  });

  afterEach(async () => {
    await mockServer.stop();
  });

  it('handles retry', async () => {
    const endpoint = await mockServer.forGet('/test').thenJson(200, {});
    const events = new Events(timers);

    const profile = new BoundProfileProvider(
      mockProfileDocument,
      mockMapDocument,
      mockProviderJson('provider'),
      config,
      sandbox,
      {
        services: ServiceSelector.withDefaultUrl(mockServer.url),
        security: [],
      },
      crypto,
      new NodeFetch(timers),
      undefined,
      events
    );

    let preFetchCount = 0;
    events.on('pre-fetch', { priority: 1 }, () => {
      preFetchCount += 1;

      return { kind: 'continue' };
    });

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

    expect(preFetchCount).toBe(2);
  });

  it('handles rejection', async () => {
    const events = new Events(timers);
    const profile = new BoundProfileProvider(
      mockProfileDocument,
      mockMapDocument,
      mockProviderJson('someprovider'),
      config,
      sandbox,
      {
        services: ServiceSelector.withDefaultUrl(
          'https://unreachable.localhost'
        ),
        security: [],
      },
      crypto,
      new NodeFetch(timers),
      undefined,
      events
    );

    const error = new UnexpectedError('modified rejection');
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
            newResult: Promise.reject(error),
          };
        }
      }
    );

    const result = await profile.perform('Test');
    expect(result).toStrictEqual(err(error));
  });

  it('passes unhandled http responses to unhandled-http (201)', async () => {
    const endpoint = await mockServer.forGet('/test').thenJson(201, {});

    const events = new Events(timers);
    const profile = new BoundProfileProvider(
      mockProfileDocument,
      mockMapDocument,
      mockProviderJson('provider'),
      config,
      sandbox,
      {
        services: ServiceSelector.withDefaultUrl(mockServer.url),
        security: [],
      },
      crypto,
      new NodeFetch(timers),
      undefined,
      events
    );

    let hookCount = 0;
    events.on('pre-unhandled-http', { priority: 1 }, () => {
      hookCount += 1;

      return { kind: 'continue' };
    });

    const result = await profile.perform('Test');
    void result;

    const seenRequests = await endpoint.getSeenRequests();
    expect(seenRequests).toHaveLength(1);
    expect(hookCount).toBe(1);
  });

  it('passes unhandled http responses to unhandled-http (400)', async () => {
    const endpoint = await mockServer.forGet('/test').thenJson(400, {});

    const events = new Events(timers);
    const profile = new BoundProfileProvider(
      mockProfileDocument,
      mockMapDocument,
      mockProviderJson('provider'),
      config,
      sandbox,
      {
        services: ServiceSelector.withDefaultUrl(mockServer.url),
        security: [],
      },
      crypto,
      new NodeFetch(timers),
      undefined,
      events
    );

    let hookCount = 0;
    events.on('pre-unhandled-http', { priority: 1 }, () => {
      hookCount += 1;

      return { kind: 'continue' };
    });

    const result = await profile.perform('Test');
    void result;

    const seenRequests = await endpoint.getSeenRequests();
    expect(seenRequests).toHaveLength(1);
    expect(hookCount).toBe(1);
  });

  it('does not pass handled http response to unhandled-http (200)', async () => {
    const endpoint = await mockServer.forGet('/test').thenJson(200, {});

    const events = new Events(timers);
    const profile = new BoundProfileProvider(
      mockProfileDocument,
      mockMapDocument,
      mockProviderJson('provider'),
      config,
      sandbox,
      {
        services: ServiceSelector.withDefaultUrl(mockServer.url),
        security: [],
      },
      crypto,
      new NodeFetch(timers),
      undefined,
      events
    );

    let hookCount = 0;
    events.on('pre-unhandled-http', { priority: 1 }, () => {
      hookCount += 1;

      return { kind: 'continue' };
    });

    const result = await profile.perform('Test');
    void result;

    const seenRequests = await endpoint.getSeenRequests();
    expect(seenRequests).toHaveLength(1);
    expect(hookCount).toBe(0);
  });
});
