import { MapDocumentNode, ProviderJson } from '@superfaceai/ast';

import { Config } from '../config';
import { UnexpectedError } from '../internal/errors';
import { assertIsRegistryProviderInfo, fetchBind } from './registry';

const request = jest.fn();
jest.mock('../internal/interpreter/http', () => {
  return {
    HttpClient: jest.fn().mockImplementation(() => ({
      request,
    })),
  };
});

const MOCK_TOKEN =
  'sfs_bb064dd57c302911602dd097bc29bedaea6a021c25a66992d475ed959aa526c7_37bce8b5';

describe('registry', () => {
  const mockMapDocument: MapDocumentNode = {
    kind: 'MapDocument',
    header: {
      kind: 'MapHeader',
      profile: {
        name: 'different-test-profile',
        scope: 'some-map-scope',
        version: {
          major: 1,
          minor: 0,
          patch: 0,
        },
      },
      provider: 'test-profile',
    },
    definitions: [],
  };

  const mockProviderJson: ProviderJson = {
    name: 'test',
    services: [{ id: 'test-service', baseUrl: 'service/base/url' }],
    defaultService: 'test-service',
  };

  beforeAll(() => {
    Config.instance().sdkAuthToken = MOCK_TOKEN;
    Config.instance().superfaceApiUrl = 'https://superface.dev';
  });

  afterAll(() => {
    jest.resetModules();
  });

  afterEach(() => {
    request.mockReset();
  });

  describe('when asserting input is registry provider info', () => {
    it('asserts correctly', () => {
      const record = {
        url: 'test/url',
        registryId: 'some-registiry-id',
        serviceUrl: 'test/service/url',
        mappingUrl: 'test/mapping/url',
        semanticProfile: 'test/profile',
        disco: [
          {
            url: 'disco/test/url',
            registryId: 'disco/some-registiry-id',
            serviceUrl: 'disco/test/service/url',
            mappingUrl: 'disco/test/mapping/url',
            semanticProfile: 'disco/test/profile',
          },
        ],
      };
      expect(assertIsRegistryProviderInfo(record)).toBeUndefined();
    });

    it('throws error on null record', () => {
      const record = null;
      expect(() => assertIsRegistryProviderInfo(record)).toThrowError(
        'Invalid response from registry'
      );
    });

    it('throws error when disco property is missing', () => {
      const record = {
        url: 'test/url',
        registryId: 'some-registiry-id',
        serviceUrl: 'test/service/url',
        mappingUrl: 'test/mapping/url',
        semanticProfile: 'test/profile',
      };
      expect(() => assertIsRegistryProviderInfo(record)).toThrowError(
        'Invalid response from registry'
      );
    });
  });

  describe('when fetching bind', () => {
    const TEST_REGISTRY_URL = 'https://example.com/test-registry';
    const TEST_SDK_TOKEN =
      'sfs_bb064dd57c302911602dd097bc29bedaea6a021c25a66992d475ed959aa526c7_37bce8b5';

    beforeEach(() => {
      const config = Config.instance();
      config.superfaceApiUrl = TEST_REGISTRY_URL;
      config.sdkAuthToken = TEST_SDK_TOKEN;
    });

    afterAll(() => {
      Config.reloadFromEnv();
    });

    it('fetches map document', async () => {
      const mockBody = {
        provider: mockProviderJson,
        map_ast: JSON.stringify(mockMapDocument),
      };
      const mockResponse = {
        statusCode: 200,
        body: mockBody,
        headers: { test: 'test' },
        debug: {
          request: {
            headers: { test: 'test' },
            url: 'test',
            body: {},
          },
        },
      };

      request.mockResolvedValue(mockResponse);

      await expect(
        fetchBind({
          profileId: 'test-profile-id',
          provider: 'test-provider',
          mapVariant: 'test-map-variant',
          mapRevision: 'test-map-revision',
        })
      ).resolves.toEqual({
        provider: mockProviderJson,
        mapAst: mockMapDocument,
      });

      expect(request).toHaveBeenCalledTimes(1);
      expect(request).toHaveBeenCalledWith('/registry/bind', {
        method: 'POST',
        headers: [`Authorization: SUPERFACE-SDK-TOKEN ${TEST_SDK_TOKEN}`],
        baseUrl: TEST_REGISTRY_URL,
        accept: 'application/json',
        contentType: 'application/json',
        body: {
          profile_id: 'test-profile-id',
          provider: 'test-provider',
          map_variant: 'test-map-variant',
          map_revision: 'test-map-revision',
        },
      });
    });

    it('fetches map document sdk token with sfs prefix', async () => {
      const mockBody = {
        provider: mockProviderJson,
        map_ast: JSON.stringify(mockMapDocument),
      };
      const mockResponse = {
        statusCode: 200,
        body: mockBody,
        headers: { test: 'test' },
        debug: {
          request: {
            headers: { test: 'test' },
            url: 'test',
            body: {},
          },
        },
      };

      request.mockResolvedValue(mockResponse);

      await expect(
        fetchBind({
          profileId: 'test-profile-id',
          provider: 'test-provider',
          mapVariant: 'test-map-variant',
          mapRevision: 'test-map-revision',
        })
      ).resolves.toEqual({
        provider: mockProviderJson,
        mapAst: mockMapDocument,
      });

      expect(request).toHaveBeenCalledTimes(1);
      expect(request).toHaveBeenCalledWith('/registry/bind', {
        method: 'POST',
        baseUrl: TEST_REGISTRY_URL,
        accept: 'application/json',
        contentType: 'application/json',
        headers: [`Authorization: SUPERFACE-SDK-TOKEN ${MOCK_TOKEN}`],
        body: {
          profile_id: 'test-profile-id',
          provider: 'test-provider',
          map_variant: 'test-map-variant',
          map_revision: 'test-map-revision',
        },
      });
    });

    it('throws error on invalid document', async () => {
      const mockBody = {
        provider: { test: 'invalid' },
        map_ast: JSON.stringify(mockMapDocument),
      };
      const mockResponse = {
        statusCode: 200,
        body: mockBody,
        headers: { test: 'test' },
        debug: {
          request: {
            headers: { test: 'test' },
            url: 'test',
            body: {},
          },
        },
      };

      request.mockResolvedValue(mockResponse);

      await expect(
        fetchBind({
          profileId: 'test-profile-id',
          provider: 'test-provider',
          mapVariant: 'test-map-variant',
          mapRevision: 'test-map-revision',
        })
      ).rejects.toEqual(
        new UnexpectedError('Registry responded with invalid body')
      );

      expect(request).toHaveBeenCalledTimes(1);
      expect(request).toHaveBeenCalledWith('/registry/bind', {
        method: 'POST',
        baseUrl: TEST_REGISTRY_URL,
        accept: 'application/json',
        headers: [`Authorization: SUPERFACE-SDK-TOKEN ${MOCK_TOKEN}`],
        contentType: 'application/json',
        body: {
          profile_id: 'test-profile-id',
          provider: 'test-provider',
          map_variant: 'test-map-variant',
          map_revision: 'test-map-revision',
        },
      });
    });
  });
});
