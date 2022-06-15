import {
  ApiKeyPlacement,
  AstMetadata,
  BackoffKind,
  HttpScheme,
  MapDocumentNode,
  OnFail,
  ProfileDocumentNode,
  ProviderJson,
  SecurityType,
} from '@superfaceai/ast';
import { getLocal, MockedEndpoint } from 'mockttp';

import { SuperJson } from '../internal/superjson';
import { MockClient } from '../test/client';
import { FailoverReason } from './reporter';

const mockSuperJsonSingle = new SuperJson({
  profiles: {
    ['test-profile']: {
      version: '1.0.0',
      defaults: {},
      providers: {
        testprovider: {},
      },
    },
  },
  providers: {
    testprovider: {},
  },
});

const mockSuperJsonSingleFailure = new SuperJson({
  profiles: {
    ['test-profile']: {
      version: '1.0.0',
      defaults: {},
      providers: {
        testprovider2: {},
      },
    },
  },
  providers: {
    testprovider2: {},
  },
});

const mockSuperJsonFailover = new SuperJson({
  profiles: {
    ['test-profile']: {
      version: '1.0.0',
      defaults: {
        Test: {
          providerFailover: true,
        },
      },
      priority: ['testprovider2', 'testprovider'],
      providers: {
        testprovider2: {
          defaults: {
            Test: {
              input: {},
              retryPolicy: {
                kind: OnFail.CIRCUIT_BREAKER,
                maxContiguousRetries: 2,
                requestTimeout: 200000,
                backoff: {
                  kind: BackoffKind.EXPONENTIAL,
                  start: 20,
                },
              },
            },
          },
        },
        testprovider: {},
      },
    },
  },
  providers: {
    testprovider2: {},
    testprovider: {},
  },
});

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
    name: 'test-profile',
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

const mockMapDocumentSuccess: MapDocumentNode = {
  kind: 'MapDocument',
  astMetadata,
  header: {
    kind: 'MapHeader',
    profile: {
      name: 'test-profile',
      version: {
        major: 1,
        minor: 2,
        patch: 3,
      },
    },
    provider: 'testprovider',
  },
  definitions: [
    {
      kind: 'MapDefinition',
      name: 'Test',
      usecaseName: 'Test',
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
};

const mockMapDocumentFailure: MapDocumentNode = {
  kind: 'MapDocument',
  astMetadata,
  header: {
    kind: 'MapHeader',
    profile: {
      name: 'test-profile',
      version: {
        major: 1,
        minor: 2,
        patch: 3,
      },
    },
    provider: 'testprovider2',
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
          url: '/unavailable',
          request: {
            kind: 'HttpRequest',
            security: [],
          },
          responseHandlers: [
            {
              kind: 'HttpResponseHandler',
              statusCode: 200,
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
                          value: "if you see me, something's wrong",
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

describe('MetricReporter', () => {
  let eventEndpoint: MockedEndpoint;

  beforeEach(async () => {
    await mockServer.start();
    eventEndpoint = await mockServer
      .post('/insights/sdk_event')
      .thenJson(202, {});
  });

  afterEach(async () => {
    await mockServer.stop();
  });

  it('should report SDK Init', async () => {
    const client = new MockClient(mockSuperJsonSingle, {
      configOverride: {
        disableReporting: false,
        superfaceApiUrl: mockServer.url,
      },
    });
    client.metricReporter?.reportEvent({
      eventType: 'SDKInit',
      occurredAt: new Date(),
    });
    while (await eventEndpoint.isPending()) {
      await new Promise(setImmediate);
    }

    const requests = await eventEndpoint.getSeenRequests();
    expect(requests).toHaveLength(1);
    expect(await requests[0].body.getJson()).toMatchObject({
      event_type: 'SDKInit',
      configuration_hash: expect.stringMatching(/\w+/),
      data: {
        configuration: {
          profiles: {
            ['test-profile']: {
              version: '1.0.0',
            },
          },
          providers: ['testprovider'],
        },
      },
    });
  });

  it('should report success', async () => {
    const client = new MockClient(mockSuperJsonSingle, {
      configOverride: {
        disableReporting: false,
        superfaceApiUrl: mockServer.url,
      },
    });
    client.addBoundProfileProvider(
      mockProfileDocument,
      mockMapDocumentSuccess,
      'testprovider',
      mockServer.url,
      mockProviderJson('provider'),
      {
        services: ServiceSelector.withDefaultUrl(mockServer.url),
        security: [],
      },
    );

    const profile = await client.getProfile('test-profile');

    await profile.getUseCase('Test').perform({});
    client.timers.tick(2000);
    while (await eventEndpoint.isPending()) {
      await new Promise(setImmediate);
    }
    const requests = await eventEndpoint.getSeenRequests();

    expect(requests).toHaveLength(1);
    expect(await requests[0].body.getJson()).toMatchObject({
      event_type: 'Metrics',
      data: {
        from: expect.stringMatching(''),
        to: expect.stringMatching(''),
        metrics: [
          {
            type: 'PerformMetrics',
            profile: 'test-profile',
            provider: 'testprovider',
            successful_performs: 1,
            failed_performs: 0,
          },
        ],
      },
    });
  });

  it('should report failure and unsuccessful switch', async () => {
    const client = new MockClient(mockSuperJsonSingleFailure, {
      configOverride: {
        disableReporting: false,
        superfaceApiUrl: mockServer.url,
      }
    });

    client.addBoundProfileProvider(
      mockProfileDocument,
      mockMapDocumentFailure,
      'testprovider2',
      mockProviderJson('testprovider'),
      'https://uvavai.lable',
      {
        services: ServiceSelector.withDefaultUrl('https://unavai.lable'),
        security: [],
      }
    );

    const profile = await client.getProfile('test-profile');

    await expect(profile.getUseCase('Test').perform({})).rejects.toThrow();
    client.timers.tick(2000);
    let requests = await eventEndpoint.getSeenRequests();
    while (requests.length < 2) {
      await new Promise(setImmediate);
      requests = await eventEndpoint.getSeenRequests();
    }

    expect(requests).toHaveLength(2);
    let metricRequest, changeRequest;
    for (const request of requests) {
      const body = (await request.body.getJson()) as { event_type: string };
      if (body.event_type === 'Metrics') {
        metricRequest = body;
      }
      if (body.event_type === 'ProviderChange') {
        changeRequest = body;
      }
    }
    expect(metricRequest).toMatchObject({
      event_type: 'Metrics',
      data: {
        from: expect.stringMatching(''),
        to: expect.stringMatching(''),
        metrics: [
          {
            type: 'PerformMetrics',
            profile: 'test-profile',
            provider: 'testprovider2',
            successful_performs: 0,
            failed_performs: 1,
          },
        ],
      },
    });
    expect(changeRequest).toMatchObject({
      event_type: 'ProviderChange',
      occurred_at: expect.stringMatching(''),
      configuration_hash: expect.stringMatching(''),
      data: {
        profile: 'test-profile',
        from_provider: 'testprovider2',
        failover_reasons: [
          {
            reason: FailoverReason.NETWORK_ERROR_DNS,
            occurred_at: expect.stringMatching(''),
          },
        ],
      },
    });
  });

  it('should report success with a delay', async () => {
    const client = new MockClient(mockSuperJsonSingle, {
      configOverride: {
        disableReporting: false,
        superfaceApiUrl: mockServer.url,
      },
    });
    client.addBoundProfileProvider(
      mockProfileDocument,
      mockMapDocumentSuccess,
      'testprovider',
      mockServer.url
      mockProviderJson('provider'),
      {
        services: ServiceSelector.withDefaultUrl(mockServer.url),
        security: [],
      },
    );

    // Send init event to have a baseline number of requests
    client.metricReporter?.reportEvent({
      eventType: 'SDKInit',
      occurredAt: new Date(),
    });

    const profile = await client.getProfile('test-profile');

    await profile.getUseCase('Test').perform({});
    client.timers.tick(800);
    while (await eventEndpoint.isPending()) {
      await new Promise(setImmediate);
    }
    let requests = await eventEndpoint.getSeenRequests();

    expect(requests).toHaveLength(1);
    client.timers.tick(300);
    requests = await eventEndpoint.getSeenRequests();
    while (requests.length < 2) {
      await new Promise(setImmediate);
      requests = await eventEndpoint.getSeenRequests();
    }
    expect(requests).toHaveLength(2);
  });

  it('should report multiple successes', async () => {
    const client = new MockClient(mockSuperJsonSingle, {
      configOverride: {
        disableReporting: false,
        superfaceApiUrl: mockServer.url,
      },
    });
    client.addBoundProfileProvider(
      mockProfileDocument,
      mockMapDocumentSuccess,
      'testprovider',
      mockServer.url
      mockProviderJson('provider'),
      {
        services: ServiceSelector.withDefaultUrl(mockServer.url),
        security: [],
      },
    );
    const profile = await client.getProfile('test-profile');

    await profile.getUseCase('Test').perform({});
    await profile.getUseCase('Test').perform({});
    client.timers.tick(2000);
    let requests = await eventEndpoint.getSeenRequests();

    while (requests.length < 1) {
      await new Promise(setImmediate);
      requests = await eventEndpoint.getSeenRequests();
    }

    expect(requests).toHaveLength(1);
    expect(await requests[0].body.getJson()).toMatchObject({
      event_type: 'Metrics',
      data: {
        from: expect.stringMatching(''),
        to: expect.stringMatching(''),
        metrics: [
          {
            type: 'PerformMetrics',
            profile: 'test-profile',
            provider: 'testprovider',
            successful_performs: 2,
            failed_performs: 0,
          },
        ],
      },
    });
  });

  it('should report multiple successes with a delay', async () => {
    const client = new MockClient(mockSuperJsonSingle, {
      configOverride: {
        disableReporting: false,
        superfaceApiUrl: mockServer.url,
      },
    });
    client.addBoundProfileProvider(
      mockProfileDocument,
      mockMapDocumentSuccess,
      'testprovider',
      mockServer.url
      mockProviderJson('provider'),
      {
        services: ServiceSelector.withDefaultUrl(mockServer.url),
        security: [],
      },
    );
    const profile = await client.getProfile('test-profile');

    await profile.getUseCase('Test').perform({});
    client.timers.tick(2000);
    let requests = await eventEndpoint.getSeenRequests();
    while (requests.length < 1) {
      await new Promise(setImmediate);
      requests = await eventEndpoint.getSeenRequests();
    }
    await profile.getUseCase('Test').perform({});
    client.timers.tick(1000);
    while (requests.length < 2) {
      await new Promise(setImmediate);
      requests = await eventEndpoint.getSeenRequests();
    }

    expect(requests).toHaveLength(2);
    expect(await requests[0].body.getJson()).toMatchObject({
      event_type: 'Metrics',
      data: {
        from: expect.stringMatching(''),
        to: expect.stringMatching(''),
        metrics: [
          {
            type: 'PerformMetrics',
            profile: 'test-profile',
            provider: 'testprovider',
            successful_performs: 1,
            failed_performs: 0,
          },
        ],
      },
    });
    expect(await requests[1].body.getJson()).toMatchObject({
      event_type: 'Metrics',
      data: {
        from: expect.stringMatching(''),
        to: expect.stringMatching(''),
        metrics: [
          {
            type: 'PerformMetrics',
            profile: 'test-profile',
            provider: 'testprovider',
            successful_performs: 1,
            failed_performs: 0,
          },
        ],
      },
    });
  });

  it('should report maximum successes within a timeout', async () => {
    let currentTime = new Date().valueOf();
    const systemTimeMock = jest
      .spyOn(Date, 'now')
      .mockImplementation(() => currentTime);
    const client = new MockClient(mockSuperJsonSingle, {
      configOverride: {
        disableReporting: false,
        superfaceApiUrl: mockServer.url,
      },
    });
    client.addBoundProfileProvider(
      mockProfileDocument,
      mockMapDocumentSuccess,
      'testprovider',
      mockServer.url
      mockProviderJson('provider'),
      {
        services: ServiceSelector.withDefaultUrl(mockServer.url),
        security: [],
      },
    );

    const profile = await client.getProfile('test-profile');

    for (let i = 0; i < 100; i++) {
      await profile.getUseCase('Test').perform({});
      client.timers.tick(900);
      currentTime = currentTime.valueOf() + 900;
    }
    client.timers.tick(1000);
    currentTime += 1000;
    let requests = await eventEndpoint.getSeenRequests();
    while (requests.length < 2) {
      await new Promise(setImmediate);
      requests = await eventEndpoint.getSeenRequests();
    }

    expect(requests).toHaveLength(2);
    expect(await requests[0].body.getJson()).toMatchObject({
      event_type: 'Metrics',
      data: {
        from: expect.stringMatching(''),
        to: expect.stringMatching(''),
        metrics: [
          {
            type: 'PerformMetrics',
            profile: 'test-profile',
            provider: 'testprovider',
            successful_performs: 68,
            failed_performs: 0,
          },
        ],
      },
    });
    expect(await requests[1].body.getJson()).toMatchObject({
      event_type: 'Metrics',
      data: {
        from: expect.stringMatching(''),
        to: expect.stringMatching(''),
        metrics: [
          {
            type: 'PerformMetrics',
            profile: 'test-profile',
            provider: 'testprovider',
            successful_performs: 32,
            failed_performs: 0,
          },
        ],
      },
    });
    systemTimeMock.mockRestore();
  });

  it('should report failure and successful switch', async () => {
    let currentTime = new Date().valueOf();
    const systemTimeMock = jest
      .spyOn(Date, 'now')
      .mockImplementation(() => currentTime);
    const client = new MockClient(mockSuperJsonFailover, {
      configOverride: {
        disableReporting: false,
        superfaceApiUrl: mockServer.url,
        metricDebounceTimeMin: 10000,
      },
    });
    client.addBoundProfileProvider(
      mockProfileDocument,
      mockMapDocumentSuccess,
      'testprovider',
      mockServer.url
      mockProviderJson('testprovider'),
      {
        services: ServiceSelector.withDefaultUrl('https://unavail.able'),
        security: [],
      },
    );
    client.addBoundProfileProvider(
      mockProfileDocument,
      mockMapDocumentFailure,
      'testprovider2',
      'https://uvavai.lable'
      mockMapDocumentFailure('testprovider2'),
      mockProviderJson('testprovider2'),
      {
        services: ServiceSelector.withDefaultUrl('https://unavail.able'),
        security: [],
      },
    );
    const profile = await client.getProfile('test-profile');

    void profile.getUseCase('Test').perform({});
    let requests = await eventEndpoint.getSeenRequests();
    while (requests.length < 2) {
      currentTime += 0.1;
      client.timers.tick(0.1);
      await new Promise(setImmediate);
      requests = await eventEndpoint.getSeenRequests();
    }

    expect(requests).toHaveLength(2);
    let metricRequest, changeRequest;
    for (const request of requests) {
      const body = (await request.body.getJson()) as {
        event_type: string;
      };
      if (body.event_type === 'Metrics') {
        metricRequest = body;
      }
      if (body.event_type === 'ProviderChange') {
        changeRequest = body;
      }
    }
    expect(metricRequest).toMatchObject({
      event_type: 'Metrics',
      data: {
        from: expect.stringMatching(''),
        to: expect.stringMatching(''),
        metrics: [
          {
            type: 'PerformMetrics',
            profile: 'test-profile',
            provider: 'testprovider2',
            successful_performs: 0,
            failed_performs: 2,
          },
          {
            type: 'PerformMetrics',
            profile: 'test-profile',
            provider: 'testprovider',
            successful_performs: 1,
            failed_performs: 0,
          },
        ],
      },
    });
    expect(changeRequest).toMatchObject({
      event_type: 'ProviderChange',
      occurred_at: expect.stringMatching(''),
      configuration_hash: expect.stringMatching(''),
      data: {
        profile: 'test-profile',
        from_provider: 'testprovider2',
        to_provider: 'testprovider',
        failover_reasons: [
          {
            reason: FailoverReason.NETWORK_ERROR_DNS,
            occurred_at: expect.stringMatching(''),
          },
        ],
      },
    });

    systemTimeMock.mockRestore();
  });
});
