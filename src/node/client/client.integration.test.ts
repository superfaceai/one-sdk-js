import { ProviderJson } from '@superfaceai/ast';
import { parseMap, parseProfile, Source } from '@superfaceai/parser';
import { mocked } from 'ts-jest/utils';

import { ProfileProvider, resolveProfileAst } from '../../core';
import { ok } from '../../lib';
import { SuperJson } from '../../schema-tools';
import { SuperfaceClient } from './client';
import { createTypedClient, typeHelper } from './client.typed';

jest.mock('../../core/profile/resolve-profile-ast');

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

const mockMapDocumentSuccessWithParameters = parseMapFromSource(`
      map Test {
        map result parameters.test
      }`);

const mockMapDocumentSuccess = parseMapFromSource(`
      map Test {
        map result "It works!"
      }`);

process.env.SUPERFACE_DISABLE_METRIC_REPORTING = 'true';

describe('SuperfaceClient integration test', () => {
  beforeEach(async () => {
    SuperJson.loadSync = () => ok(mockSuperJsonSingle);
  });

  it('should pass parameters from super.json to the map', async () => {
    const client = new SuperfaceClient();

    // Let .bind happen with mocked inputs
    mocked(resolveProfileAst).mockResolvedValue(mockProfileDocument);
    // Mocking private property of ProfileProvider
    jest
      .spyOn(ProfileProvider.prototype as any, 'resolveProviderInfo')
      .mockResolvedValue({
        providerName: 'example',
        providerInfo: mockProviderJson,
      });
    jest
      .spyOn(ProfileProvider.prototype as any, 'resolveMapAst')
      .mockResolvedValue({ mapAst: mockMapDocumentSuccessWithParameters });

    const profile = await client.getProfile('example');

    const result = await profile.getUseCase('Test').perform({});

    expect(result.isOk() && result.value).toEqual('it works!');
  });

  it('should pass parameters from perform to the map', async () => {
    const client = new SuperfaceClient();

    // Let .bind happen with mocked inputs
    mocked(resolveProfileAst).mockResolvedValue(mockProfileDocument);
    // Mocking private property of ProfileProvider
    jest
      .spyOn(ProfileProvider.prototype as any, 'resolveProviderInfo')
      .mockResolvedValue({
        providerName: 'example',
        providerInfo: mockProviderJson,
      });
    jest
      .spyOn(ProfileProvider.prototype as any, 'resolveMapAst')
      .mockResolvedValue({ mapAst: mockMapDocumentSuccessWithParameters });

    const profile = await client.getProfile('example');

    const result = await profile
      .getUseCase('Test')
      .perform({}, { parameters: { test: 'it also works!' } });

    expect(result.isOk() && result.value).toEqual('it also works!');
  });

  describe('typed client', () => {
    it('should perform successfully', async () => {
      mocked(resolveProfileAst).mockResolvedValue(mockProfileDocument);
      // Mocking private property of ProfileProvider
      jest
        .spyOn(ProfileProvider.prototype as any, 'resolveProviderInfo')
        .mockResolvedValue({
          providerName: 'example',
          providerInfo: mockProviderJson,
        });
      jest
        .spyOn(ProfileProvider.prototype as any, 'resolveMapAst')
        .mockResolvedValue({ mapAst: mockMapDocumentSuccess });

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
