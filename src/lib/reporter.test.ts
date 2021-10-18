import {
  BackoffKind,
  MapDocumentNode,
  OnFail,
  ProfileDocumentNode,
} from '@superfaceai/ast';
import { getLocal, MockedEndpoint } from 'mockttp';

import { BoundProfileProvider, SuperfaceClient } from '../client';
import { invalidateSuperfaceClientCache } from '../client/client';
import { Config } from '../config';
import { SuperJson } from '../internal/superjson';
import { FailoverReason } from './reporter';
import { ok } from './result/result';

jest.useFakeTimers('legacy');

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

const mockProfileDocument: ProfileDocumentNode = {
  kind: 'ProfileDocument',
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

const mockMapDocumentFailure: (provider?: string) => MapDocumentNode = (
  provider = 'testprovider'
) => ({
  kind: 'MapDocument',
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
    provider,
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
});

const mockServer = getLocal();

describe('MetricReporter', () => {
  let eventEndpoint: MockedEndpoint;
  beforeEach(async () => {
    SuperJson.loadSync = () => ok(mockSuperJsonSingle);
    await mockServer.start();
    eventEndpoint = await mockServer
      .post('/insights/sdk_event')
      .thenJson(202, {});
    Config.instance().disableReporting = false;
    Config.instance().superfaceApiUrl = mockServer.url;
  });

  afterEach(async () => {
    invalidateSuperfaceClientCache();
    await mockServer.stop();
  });

  it('should report SDK Init', async () => {
    const client = new SuperfaceClient();
    void client;
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
    const client = new SuperfaceClient();
    const mockBoundProfileProvider = new BoundProfileProvider(
      mockProfileDocument,
      mockMapDocumentSuccess,
      'provider',
      { baseUrl: mockServer.url, security: [] },
      client
    );
    jest
      .spyOn(client, 'cacheBoundProfileProvider')
      .mockResolvedValue(mockBoundProfileProvider);

    const profile = await client.getProfile('test-profile');

    await profile.getUseCase('Test').perform({});
    jest.advanceTimersByTime(2000);
    while (await eventEndpoint.isPending()) {
      await new Promise(setImmediate);
    }
    const requests = await eventEndpoint.getSeenRequests();

    expect(requests).toHaveLength(2);
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

  it('should report failure and unsuccessful switch', async () => {
    const client = new SuperfaceClient();
    const mockBoundProfileProvider = new BoundProfileProvider(
      mockProfileDocument,
      mockMapDocumentFailure(),
      'testprovider',
      { baseUrl: 'https://unavai.lable', security: [] },
      client
    );
    jest
      .spyOn(client, 'cacheBoundProfileProvider')
      .mockResolvedValue(mockBoundProfileProvider);

    const profile = await client.getProfile('test-profile');

    await expect(profile.getUseCase('Test').perform({})).rejects.toThrow();
    jest.advanceTimersByTime(2000);
    let requests = await eventEndpoint.getSeenRequests();
    while (requests.length < 3) {
      await new Promise(setImmediate);
      requests = await eventEndpoint.getSeenRequests();
    }

    expect(requests).toHaveLength(3);
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
            provider: 'testprovider',
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
        from_provider: 'testprovider',
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
    const client = new SuperfaceClient();
    const mockBoundProfileProvider = new BoundProfileProvider(
      mockProfileDocument,
      mockMapDocumentSuccess,
      'provider',
      { baseUrl: mockServer.url, security: [] },
      client
    );
    jest
      .spyOn(client, 'cacheBoundProfileProvider')
      .mockResolvedValue(mockBoundProfileProvider);

    const profile = await client.getProfile('test-profile');

    await profile.getUseCase('Test').perform({});
    jest.advanceTimersByTime(800);
    while (await eventEndpoint.isPending()) {
      await new Promise(setImmediate);
    }
    let requests = await eventEndpoint.getSeenRequests();

    expect(requests).toHaveLength(1);
    jest.advanceTimersByTime(300);
    requests = await eventEndpoint.getSeenRequests();
    while (requests.length < 2) {
      await new Promise(setImmediate);
      requests = await eventEndpoint.getSeenRequests();
    }
    expect(requests).toHaveLength(2);
  });

  it('should report multiple successes', async () => {
    const client = new SuperfaceClient();
    const mockBoundProfileProvider = new BoundProfileProvider(
      mockProfileDocument,
      mockMapDocumentSuccess,
      'provider',
      { baseUrl: mockServer.url, security: [] },
      client
    );
    jest
      .spyOn(client, 'cacheBoundProfileProvider')
      .mockResolvedValue(mockBoundProfileProvider);

    const profile = await client.getProfile('test-profile');

    await profile.getUseCase('Test').perform({});
    await profile.getUseCase('Test').perform({});
    jest.advanceTimersByTime(2000);
    while (await eventEndpoint.isPending()) {
      await new Promise(setImmediate);
    }
    const requests = await eventEndpoint.getSeenRequests();

    expect(requests).toHaveLength(2);
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
            successful_performs: 2,
            failed_performs: 0,
          },
        ],
      },
    });
  });

  it('should report multiple successes with a delay', async () => {
    const client = new SuperfaceClient();
    const mockBoundProfileProvider = new BoundProfileProvider(
      mockProfileDocument,
      mockMapDocumentSuccess,
      'provider',
      { baseUrl: mockServer.url, security: [] },
      client
    );
    jest
      .spyOn(client, 'cacheBoundProfileProvider')
      .mockResolvedValue(mockBoundProfileProvider);

    const profile = await client.getProfile('test-profile');

    await profile.getUseCase('Test').perform({});
    jest.advanceTimersByTime(2000);
    let requests = await eventEndpoint.getSeenRequests();
    while (requests.length < 2) {
      await new Promise(setImmediate);
      requests = await eventEndpoint.getSeenRequests();
    }
    await profile.getUseCase('Test').perform({});
    jest.advanceTimersByTime(1000);
    while (requests.length < 3) {
      await new Promise(setImmediate);
      requests = await eventEndpoint.getSeenRequests();
    }

    expect(requests).toHaveLength(3);
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
    expect(await requests[2].body.getJson()).toMatchObject({
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
    const client = new SuperfaceClient();
    const mockBoundProfileProvider = new BoundProfileProvider(
      mockProfileDocument,
      mockMapDocumentSuccess,
      'provider',
      { baseUrl: mockServer.url, security: [] },
      client
    );
    jest
      .spyOn(client, 'cacheBoundProfileProvider')
      .mockResolvedValue(mockBoundProfileProvider);

    const profile = await client.getProfile('test-profile');

    for (let i = 0; i < 100; i++) {
      await profile.getUseCase('Test').perform({});
      jest.advanceTimersByTime(900);
      currentTime = currentTime.valueOf() + 900;
    }
    jest.advanceTimersByTime(1000);
    currentTime += 1000;
    let requests = await eventEndpoint.getSeenRequests();
    while (requests.length < 3) {
      await new Promise(setImmediate);
      requests = await eventEndpoint.getSeenRequests();
    }

    expect(requests).toHaveLength(3);
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
            successful_performs: 68,
            failed_performs: 0,
          },
        ],
      },
    });
    expect(await requests[2].body.getJson()).toMatchObject({
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
    const originalDebounceMin = Config.instance().metricDebounceTimeMin;
    Config.instance().metricDebounceTimeMin = 10000;
    let currentTime = new Date().valueOf();
    const systemTimeMock = jest
      .spyOn(Date, 'now')
      .mockImplementation(() => currentTime);
    SuperJson.loadSync = () => ok(mockSuperJsonFailover);
    const client = new SuperfaceClient();
    const mockBoundProfileProvider = new BoundProfileProvider(
      mockProfileDocument,
      mockMapDocumentSuccess,
      'testprovider',
      { baseUrl: 'https://unavail.able', security: [] },
      client
    );
    const mockBoundProfileProvider2 = new BoundProfileProvider(
      mockProfileDocument,
      mockMapDocumentFailure('testprovider2'),
      'testprovider2',
      { baseUrl: 'https://unavail.able', security: [] },
      client
    );
    jest
      .spyOn(client, 'cacheBoundProfileProvider')
      .mockImplementation((_, providerConfig) => {
        if (providerConfig.name === 'testprovider') {
          return Promise.resolve(mockBoundProfileProvider);
        } else {
          return Promise.resolve(mockBoundProfileProvider2);
        }
      });

    const profile = await client.getProfile('test-profile');

    const result = profile.getUseCase('Test').perform({});
    let requests = await eventEndpoint.getSeenRequests();
    while (requests.length < 3) {
      currentTime += 0.1;
      jest.advanceTimersByTime(0.1);
      await new Promise(setImmediate);
      requests = await eventEndpoint.getSeenRequests();
    }

    expect(requests).toHaveLength(3);
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
    Config.instance().metricDebounceTimeMin = originalDebounceMin;
  });
});
