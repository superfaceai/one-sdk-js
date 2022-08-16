import '../../schema-tools/superjson/utils';

import type { ProviderJson } from '@superfaceai/ast';
import { parseMap, parseProfile, Source } from '@superfaceai/parser';
import { mocked } from 'ts-jest/utils';

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

process.env.SUPERFACE_DISABLE_METRIC_REPORTING = 'true';

jest.mock('../../schema-tools/superjson/utils', () => ({
  loadSuperJsonSync: () => ok(mockSuperJsonSingle),
}));

describe('SuperfaceClient integration test', () => {
  it('should pass parameters from super.json to the map', async () => {
    const client = new SuperfaceClient();

    // Let .bind happen with mocked inputs
    mocked(resolveProfileAst).mockResolvedValue(mockProfileDocument);
    mocked(resolveMapAst).mockResolvedValue(mockMapDocumentSuccessWithParameters);
    mocked(resolveProviderJson).mockResolvedValue(mockProviderJson);

    const profile = await client.getProfile('example');

    const result = await profile.getUseCase('Test').perform({});

    expect(result.isOk() && result.value).toEqual('it works!');
  });

  it('should pass parameters from perform to the map', async () => {
    const client = new SuperfaceClient();

    // Let .bind happen with mocked inputs
    mocked(resolveProfileAst).mockResolvedValue(mockProfileDocument);
    mocked(resolveMapAst).mockResolvedValue(mockMapDocumentSuccessWithParameters);
    mocked(resolveProviderJson).mockResolvedValue(mockProviderJson);


    const profile = await client.getProfile('example');

    const result = await profile
      .getUseCase('Test')
      .perform({}, { parameters: { test: 'it also works!' } });

    expect(result.isOk() && result.value).toEqual('it also works!');
  });

  describe('typed client', () => {
    it('should perform successfully', async () => {
      mocked(resolveProfileAst).mockResolvedValue(mockProfileDocument);
      mocked(resolveMapAst).mockResolvedValue(mockMapDocumentSuccess);
      mocked(resolveProviderJson).mockResolvedValue(mockProviderJson);


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
