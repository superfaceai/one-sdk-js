import '../../schema-tools/superjson/utils';

import type { ProviderJson } from '@superfaceai/ast';
import { parseMap, parseProfile, Source } from '@superfaceai/parser';

import { resolveMapAst, resolveProfileAst, resolveProviderJson } from '../../core';
import { ok } from '../../lib';
import { SuperfaceClient } from './client';
import { createTypedClient, typeHelper } from './client.typed';

jest.mock('../../core/profile/resolve-profile-ast');
jest.mock('../../core/profile-provider/resolve-map-ast');
jest.mock('../../core/provider/resolve-provider-json');

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

const mockSuperJsonSingle = {
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
};

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
    input {
      field
    }
    result string
  }`);

const mockMapDocumentSuccessWithParameters = parseMapFromSource(`
      map Test {
        map result parameters.test
      }`);

const mockMapDocumentSuccess = parseMapFromSource(`
      map Test {
        map result "It works!"
      }`);

const mockMapDocumentWithInput = parseMapFromSource(`
      map Test {
        map result input.field
      }`);

process.env.SUPERFACE_DISABLE_METRIC_REPORTING = 'true';

jest.mock('../../schema-tools/superjson/utils', () => ({
  loadSuperJsonSync: () => ok(mockSuperJsonSingle),
}));

describe('SuperfaceClient integration test', () => {
  it('should pass parameters from super.json to the map', async () => {
    const client = new SuperfaceClient();

    // Let .bind happen with mocked inputs
    jest.mocked(resolveProfileAst).mockResolvedValue(mockProfileDocument);
    jest.mocked(resolveMapAst).mockResolvedValue(mockMapDocumentSuccessWithParameters);
    jest.mocked(resolveProviderJson).mockResolvedValue(mockProviderJson);

    const profile = await client.getProfile('example');

    const result = await profile.getUseCase('Test').perform({});

    expect(result.isOk() && result.value).toEqual('it works!');
  });

  it('should pass parameters from perform to the map', async () => {
    const client = new SuperfaceClient();

    // Let .bind happen with mocked inputs
    jest.mocked(resolveProfileAst).mockResolvedValue(mockProfileDocument);
    jest.mocked(resolveMapAst).mockResolvedValue(mockMapDocumentSuccessWithParameters);
    jest.mocked(resolveProviderJson).mockResolvedValue(mockProviderJson);


    const profile = await client.getProfile('example');

    const result = await profile
      .getUseCase('Test')
      .perform({}, { parameters: { test: 'it also works!' } });

    expect(result.isOk() && result.value).toEqual('it also works!');
  });

  it('should accept null in input and return as result', async () => {
    const client = new SuperfaceClient();

    jest.mocked(resolveProfileAst).mockResolvedValue(mockProfileDocument);
    jest.mocked(resolveMapAst).mockResolvedValue(mockMapDocumentWithInput);
    jest.mocked(resolveProviderJson).mockResolvedValue(mockProviderJson);

    const profile = await client.getProfile('example');

    const input: any = {};
    input.field = null;

    const result = await profile
      .getUseCase('Test')
      .perform(input);

    expect(result.isOk() && result.value).toEqual(null);
  });

  describe('typed client', () => {
    it('should perform successfully', async () => {
      jest.mocked(resolveProfileAst).mockResolvedValue(mockProfileDocument);
      jest.mocked(resolveMapAst).mockResolvedValue(mockMapDocumentSuccess);
      jest.mocked(resolveProviderJson).mockResolvedValue(mockProviderJson);

      const ClientClass = createTypedClient({
        example: { Test: typeHelper<Record<string, never>, string>() },
      });
      const client = new ClientClass();
      const profile = await client.getProfile('example');
      const result = await profile.getUseCase('Test').perform({});

      expect(result.isOk() && result.value).toEqual('It works!');
    });
  });
});
