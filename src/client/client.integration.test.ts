import { ProviderJson } from '@superfaceai/ast';
import { parseMap, parseProfile, Source } from '@superfaceai/parser';

import { ProfileProvider } from '..';
import { SuperfaceClient } from '../client';
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
    example: {
      parameters: {
        test: 'it works!',
      },
    },
  },
});

const mockProviderJson: ProviderJson = {
  name: 'example',
  services: [
    {
      id: 'example',
      baseUrl: 'https://example.dev/api',
    },
  ],
  securitySchemes: [],
  defaultService: 'example',
  parameters: [
    {
      name: 'test',
    },
  ],
};

const mockProfileDocument = parseProfileFromSource(`
  usecase Test safe {
    result string
  }`);

const mockMapDocumentSuccess = parseMapFromSource(`
      map Test {
        map result parameters.test
      }`);

process.env.SUPERFACE_DISABLE_METRIC_REPORTING = 'true';

describe('SuperfaceClient integration test', () => {
  beforeEach(async () => {
    SuperJson.loadSync = () => ok(mockSuperJsonSingle);
  });

  it('should pass parameters from super.json to the map', async () => {
    const client = new SuperfaceClient();

    // Let .bind happen with mocked inputs
    // Mocking private property of ProfileProvider
    jest
      .spyOn(ProfileProvider.prototype as any, 'resolveProfileAst')
      .mockResolvedValue(mockProfileDocument);
    jest
      .spyOn(ProfileProvider.prototype as any, 'resolveProviderInfo')
      .mockResolvedValue({
        providerName: 'example',
        providerInfo: mockProviderJson,
      });
    jest
      .spyOn(ProfileProvider.prototype as any, 'resolveMapAst')
      .mockResolvedValue({ mapAst: mockMapDocumentSuccess });

    const profile = await client.getProfile('example');

    const result = await profile.getUseCase('Test').perform({});

    expect(result.isOk() && result.value).toEqual('it works!');
  });
});
