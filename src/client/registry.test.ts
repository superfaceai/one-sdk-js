import { MapDocumentNode } from '@superfaceai/ast';

import { Config } from '../config';
import { ProviderJson } from '../internal/providerjson';
import {
  assertIsRegistryProviderInfo,
  fetchBind,
  fetchMapAST,
  fetchProviders,
} from './registry';

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
    Config().sdkAuthToken = MOCK_TOKEN;
    Config().superfaceApiUrl = 'https://superface.dev';
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
        new Error('Invalid response from registry!')
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
        new Error('Invalid response from registry!')
      );
    });
  });

  describe('when fetching map AST', () => {
    it('fetches map document', async () => {
      const mockResponse = {
        statusCode: 200,
        body: mockMapDocument,
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

      await expect(fetchMapAST('test-url')).resolves.toEqual(mockMapDocument);

      expect(request).toHaveBeenCalledTimes(1);
      expect(request).toHaveBeenCalledWith('test-url', {
        method: 'GET',
        accept: 'application/json',
      });
    });
  });

  describe('when fetching providers', () => {
    const mockRecord = {
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

    it('fetches map documentt', async () => {
      const mockResponse = {
        statusCode: 200,
        body: mockRecord,
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

      await expect(fetchProviders('test-id', 'test-url')).resolves.toEqual(
        mockRecord.disco
      );

      expect(request).toHaveBeenCalledTimes(1);
      expect(request).toHaveBeenCalledWith('test-url', {
        method: 'GET',
        queryParameters: {
          semanticProfile: 'test-id',
        },
        accept: 'application/json',
      });
    });
  });

  describe('when fetching bind', () => {
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
        fetchBind(
          {
            profileId: 'test-profile-id',
            provider: 'test-provider',
            mapVariant: 'test-map-variant',
            mapRevision: 'test-map-revision',
          },
          { registryUrl: 'test-registiry-url' }
        )
      ).resolves.toEqual({
        provider: mockProviderJson,
        mapAst: mockMapDocument,
      });

      expect(request).toHaveBeenCalledTimes(1);
      expect(request).toHaveBeenCalledWith('/registry/bind', {
        method: 'POST',
        headers: [
          'Authorization: SUPERFACE-SDK-TOKEN sfs_bb064dd57c302911602dd097bc29bedaea6a021c25a66992d475ed959aa526c7_37bce8b5',
        ],
        baseUrl: 'test-registiry-url',
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
        fetchBind(
          {
            profileId: 'test-profile-id',
            provider: 'test-provider',
            mapVariant: 'test-map-variant',
            mapRevision: 'test-map-revision',
          },
          { registryUrl: 'test-registiry-url' }
        )
      ).resolves.toEqual({
        provider: mockProviderJson,
        mapAst: mockMapDocument,
      });

      expect(request).toHaveBeenCalledTimes(1);
      expect(request).toHaveBeenCalledWith('/registry/bind', {
        method: 'POST',
        baseUrl: 'test-registiry-url',
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
      ).rejects.toEqual(new Error('registry responded with invalid body'));

      expect(request).toHaveBeenCalledTimes(1);
      expect(request).toHaveBeenCalledWith('/registry/bind', {
        method: 'POST',
        baseUrl: expect.stringMatching('https://'),
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
