import { MapDocumentNode, ProfileDocumentNode } from '@superfaceai/ast';
import { getLocal } from 'mockttp';

import { BoundProfileProvider, SuperfaceClient } from '../client';
import { SuperJson } from '../internal/superjson';
import { ok } from './result/result';

jest.unmock('cross-fetch');

const mockSuperJson = new SuperJson({
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
      scope: 'test',
      name: 'profile',
      version: {
        major: 1,
        minor: 2,
        patch: 3,
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

const mockServer = getLocal();

describe('MetricReporter', () => {
  it('should report metrics automagically', async done => {
    SuperJson.loadSync = () => ok(mockSuperJson);
    jest.mock('../client/registry', () => ({
      ...jest.requireActual('../client/registry'),
      getDefaultRegistryUrl: () => mockServer.url,
    }));
    await mockServer
      .post('/sdk-events')
      .always()
      .thenCallback(async request => {
        console.log(request);

        return {
          status: 200,
          body: 'hello',
        };
      });

    const client = new SuperfaceClient();
    (client as any).boundCache[
      '{"id":"test-profile","version":"1.0.0"}{"name":"testprovider","security":[]}'
    ] = new BoundProfileProvider(mockProfileDocument, mockMapDocument, {
      security: [],
    });
    const profile = await client.getProfile('test-profile');
    await profile.getUseCase('Test').perform();
    await profile.getUseCase('Test').perform();
    // console.log(result);

    expect(client).not.toBe(undefined);
    setTimeout(done, 20000);
  }, 25000);
});
