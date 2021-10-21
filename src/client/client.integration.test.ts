import { parseMap, parseProfile, Source } from '@superfaceai/parser';

import { BoundProfileProvider, SuperfaceClient } from '../client';
import { invalidateSuperfaceClientCache } from '../client/client';
import { Config } from '../config';
import { SuperJson } from '../internal/superjson';
import { ok } from '../lib/result/result';

const parseMapFromSource = (source: string) =>
  parseMap(
    new Source(
      `
      profile = "example@0.0"
      provider = "example"
      ` + source
    )
  );

const parseProfileFromSource = (source: string) =>
  parseProfile(
    new Source(
      `
      name = "example"
      version = "0.0.0"
      ` + source
    )
  );

const mockSuperJsonSingle = new SuperJson({
  profiles: {
    ['example']: {
      version: '1.0.0',
      defaults: {},
      providers: {
        example: {},
      },
    },
  },
  providers: {
    example: {},
  },
});

const mockProfileDocument = parseProfileFromSource(`
  usecase Test safe {
    result string
  }`);

const mockMapDocumentSuccess = parseMapFromSource(`
      map Test {
        map result parameters.test
      }`);

describe('SuperfaceClient integration test', () => {
  beforeEach(async () => {
    SuperJson.loadSync = () => ok(mockSuperJsonSingle);
    Config.instance().disableReporting = true;
  });

  afterEach(async () => {
    invalidateSuperfaceClientCache();
  });

  it('should pass parameters from super.json to the map', async () => {
    const client = new SuperfaceClient();
    const mockBoundProfileProvider = new BoundProfileProvider(
      mockProfileDocument,
      mockMapDocumentSuccess,
      'example',
      { security: [], baseUrl: '👉👈', parameters: { test: 'it works!' } },
      client
    );
    jest
      .spyOn(client, 'cacheBoundProfileProvider')
      .mockResolvedValue(mockBoundProfileProvider);

    const profile = await client.getProfile('example');

    const result = await profile.getUseCase('Test').perform({});

    expect(result.isOk() && result.value).toEqual('it works!');
  });
});

