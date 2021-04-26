import { MapDocumentNode } from '@superfaceai/ast';
import { mocked } from 'ts-jest/utils';

import { ProviderJson } from '../../internal';
import { HttpClient } from '../../internal/http/http';
import {
  assertIsRegistryProviderInfo,
  DEFAULT_REGISTRY_URL,
  fetchBind,
  fetchMapAST,
  fetchProviders,
} from './registry';

jest.mock('../../internal/http/http');

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

  afterEach(() => {
    jest.resetAllMocks();
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

      mocked(HttpClient.request).mockResolvedValue(mockResponse);

      await expect(fetchMapAST('test-url')).resolves.toEqual(mockMapDocument);

      expect(HttpClient.request).toHaveBeenCalledTimes(1);
      expect(HttpClient.request).toHaveBeenCalledWith('test-url', {
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

      mocked(HttpClient.request).mockResolvedValue(mockResponse);

      await expect(fetchProviders('test-id', 'test-url')).resolves.toEqual(
        mockRecord.disco
      );

      expect(HttpClient.request).toHaveBeenCalledTimes(1);
      expect(HttpClient.request).toHaveBeenCalledWith('test-url', {
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

      mocked(HttpClient.request).mockResolvedValue(mockResponse);

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

      expect(HttpClient.request).toHaveBeenCalledTimes(1);
      expect(HttpClient.request).toHaveBeenCalledWith('/registry/bind', {
        method: 'POST',
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

      mocked(HttpClient.request).mockResolvedValue(mockResponse);

      await expect(
        fetchBind({
          profileId: 'test-profile-id',
          provider: 'test-provider',
          mapVariant: 'test-map-variant',
          mapRevision: 'test-map-revision',
        })
      ).rejects.toEqual(new Error('registry responded with invalid body'));

      expect(HttpClient.request).toHaveBeenCalledTimes(1);
      expect(HttpClient.request).toHaveBeenCalledWith('/registry/bind', {
        method: 'POST',
        baseUrl: DEFAULT_REGISTRY_URL,
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
  });
});
