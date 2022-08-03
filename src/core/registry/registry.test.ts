import {
  AssertionError,
  AstMetadata,
  MapDocumentNode,
  ProfileDocumentNode,
  ProviderJson,
} from '@superfaceai/ast';

import { MockTimers } from '../../mock';
import { NodeCrypto, NodeFetch, NodeFileSystem } from '../../node';
import { Config } from '../config';
import {
  bindResponseError,
  invalidProviderResponseError,
  invalidResponseError,
  unknownBindResponseError,
  unknownProviderInfoError,
} from '../errors';
import { JSON_PROBLEM_CONTENT } from '../interpreter';
import {
  assertIsRegistryProviderInfo,
  fetchBind,
  fetchMapSource,
  fetchProfileAst,
  fetchProviderInfo,
} from './registry';

const request = jest.fn();
jest.mock('../interpreter/http', () => {
  return {
    HttpClient: jest.fn().mockImplementation(() => ({
      request,
    })),
  };
});

const MOCK_TOKEN =
  'sfs_bb064dd57c302911602dd097bc29bedaea6a021c25a66992d475ed959aa526c7_37bce8b5';
const timers = new MockTimers();
const crypto = new NodeCrypto();

describe('registry', () => {
  const astMetadata: AstMetadata = {
    sourceChecksum: 'checksum',
    astVersion: {
      major: 1,
      minor: 0,
      patch: 0,
    },
    parserVersion: {
      major: 1,
      minor: 0,
      patch: 0,
    },
  };

  const mockMapDocument: MapDocumentNode = {
    astMetadata,
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

  const mockProfileDocument: ProfileDocumentNode = {
    astMetadata,
    kind: 'ProfileDocument',
    definitions: [],
    header: {
      kind: 'ProfileHeader',
      name: 'test-profile-id',
      scope: 'scope',
      version: {
        major: 1,
        minor: 1,
        patch: 1,
      },
    },
  };

  const mockProviderJson: ProviderJson = {
    name: 'test',
    services: [{ id: 'test-service', baseUrl: 'service/base/url' }],
    defaultService: 'test-service',
  };

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

  describe('when fetching provider info', () => {
    const TEST_REGISTRY_URL = 'https://example.com/test-registry';
    const TEST_SDK_TOKEN =
      'sfs_bb064dd57c302911602dd097bc29bedaea6a021c25a66992d475ed959aa526c7_37bce8b5';
    const config = new Config(NodeFileSystem, {
      superfaceApiUrl: TEST_REGISTRY_URL,
      sdkAuthToken: TEST_SDK_TOKEN,
    });

    it('fetches provider info', async () => {
      const mockBody = {
        definition: mockProviderJson,
      };
      const mockResponse = {
        statusCode: 200,
        body: mockBody,
        debug: {
          request: {
            url: 'test',
            body: {},
          },
        },
      };

      request.mockResolvedValue(mockResponse);

      await expect(
        fetchProviderInfo('test', config, crypto, new NodeFetch(timers))
      ).resolves.toEqual(mockProviderJson);

      expect(request).toHaveBeenCalledTimes(1);
      expect(request).toHaveBeenCalledWith('/providers/test', {
        method: 'GET',
        headers: [`Authorization: SUPERFACE-SDK-TOKEN ${TEST_SDK_TOKEN}`],
        baseUrl: TEST_REGISTRY_URL,
        accept: 'application/json',
        contentType: 'application/json',
        body: undefined,
      });
    });

    it('throws on invalid body', async () => {
      const mockBody = {};
      const mockResponse = {
        statusCode: 200,
        body: mockBody,
        debug: {
          request: {
            url: 'test',
            body: {},
          },
        },
      };

      request.mockResolvedValue(mockResponse);

      await expect(
        fetchProviderInfo('test', config, crypto, new NodeFetch(timers))
      ).rejects.toEqual(
        unknownProviderInfoError({
          message: 'Registry responded with invalid body',
          body: mockBody,
          provider: 'test',
          statusCode: 200,
        })
      );

      expect(request).toHaveBeenCalledTimes(1);
    });

    it('throws on invalid provider json', async () => {
      const mockBody = {
        definition: {},
      };
      const mockResponse = {
        statusCode: 200,
        body: mockBody,
        debug: {
          request: {
            url: 'test',
            body: {},
          },
        },
      };

      request.mockResolvedValue(mockResponse);

      await expect(
        fetchProviderInfo('test', config, crypto, new NodeFetch(timers))
      ).rejects.toEqual(
        unknownProviderInfoError({
          message: 'Registry responded with invalid ProviderJson definition',
          body: {},
          provider: 'test',
          statusCode: 200,
        })
      );

      expect(request).toHaveBeenCalledTimes(1);
    });
  });

  describe('when fetching bind', () => {
    const TEST_REGISTRY_URL = 'https://example.com/test-registry';
    const TEST_SDK_TOKEN =
      'sfs_bb064dd57c302911602dd097bc29bedaea6a021c25a66992d475ed959aa526c7_37bce8b5';
    const config = new Config(NodeFileSystem, {
      superfaceApiUrl: TEST_REGISTRY_URL,
      sdkAuthToken: TEST_SDK_TOKEN,
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
        fetchBind(
          {
            profileId: 'test-profile-id',
            provider: 'test-provider',
            mapVariant: 'test-map-variant',
            mapRevision: 'test-map-revision',
          },
          config,
          crypto,
          new NodeFetch(timers)
        )
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
        fetchBind(
          {
            profileId: 'test-profile-id',
            provider: 'test-provider',
            mapVariant: 'test-map-variant',
            mapRevision: 'test-map-revision',
          },
          config,
          crypto,
          new NodeFetch(timers)
        )
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

    it('throws error on invalid provider document', async () => {
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
        fetchBind(
          {
            profileId: 'test-profile-id',
            provider: 'test-provider',
            mapVariant: 'test-map-variant',
            mapRevision: 'test-map-revision',
          },
          config,
          crypto,
          new NodeFetch(timers)
        )
      ).rejects.toThrow(
        invalidProviderResponseError(
          new AssertionError(
            [['must have required property "defaultService"', []]],
            mockBody.provider
          )
        )
      );

      expect(request).toHaveBeenCalledTimes(1);
    });

    it('throws error on invalid response body', async () => {
      const mockBody = {};
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
          config,
          crypto,
          new NodeFetch(timers)
        )
      ).rejects.toEqual(
        unknownBindResponseError({
          profileId: 'test-profile-id',
          provider: 'test-provider',
          mapVariant: 'test-map-variant',
          mapRevision: 'test-map-revision',
          statusCode: 200,
          body: mockBody,
          apiUrl: TEST_REGISTRY_URL,
        })
      );

      expect(request).toHaveBeenCalledTimes(1);
    });

    it('throws error on invalid status code and empty response body', async () => {
      const mockBody = {};
      const mockResponse = {
        statusCode: 400,
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
          config,
          crypto,
          new NodeFetch(timers)
        )
      ).rejects.toEqual(
        unknownBindResponseError({
          profileId: 'test-profile-id',
          provider: 'test-provider',
          mapVariant: 'test-map-variant',
          mapRevision: 'test-map-revision',
          statusCode: 400,
          body: mockBody,
          apiUrl: TEST_REGISTRY_URL,
        })
      );

      expect(request).toHaveBeenCalledTimes(1);
    });

    it('throws error on invalid status code and response body with detail', async () => {
      const mockBody = {
        detail: 'Test',
        title: 'Title',
      };
      const mockResponse = {
        statusCode: 400,
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
          config,
          crypto,
          new NodeFetch(timers)
        )
      ).rejects.toEqual(
        bindResponseError({
          profileId: 'test-profile-id',
          provider: 'test-provider',
          mapVariant: 'test-map-variant',
          mapRevision: 'test-map-revision',
          statusCode: 400,
          detail: 'Test',
          title: 'Title',
          apiUrl: TEST_REGISTRY_URL,
        })
      );

      expect(request).toHaveBeenCalledTimes(1);
    });

    it('returns undefined on invalid map document', async () => {
      const mockBody = {
        provider: mockProviderJson,
        map_ast: 'this is not fine',
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
          config,
          crypto,
          new NodeFetch(timers)
        )
      ).resolves.toEqual({
        provider: mockProviderJson,
        mapAst: undefined,
      });

      expect(request).toHaveBeenCalledTimes(1);
    });
  });

  describe('when fetching profile ast', () => {
    const TEST_REGISTRY_URL = 'https://example.com/test-registry';
    const TEST_SDK_TOKEN =
      'sfs_bb064dd57c302911602dd097bc29bedaea6a021c25a66992d475ed959aa526c7_37bce8b5';
    const config = new Config(NodeFileSystem, {
      superfaceApiUrl: TEST_REGISTRY_URL,
      sdkAuthToken: TEST_SDK_TOKEN,
    });

    it('fetches profile AST with scope', async () => {
      const mockResponse = {
        statusCode: 200,
        body: JSON.stringify(mockProfileDocument),
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

      const profileId = 'scope/test-profile-id@1.0.0';
      await expect(
        fetchProfileAst(profileId, config, crypto, new NodeFetch(timers))
      ).resolves.toEqual(mockProfileDocument);

      expect(request).toHaveBeenCalledTimes(1);
      expect(request).toHaveBeenCalledWith(`/${profileId}`, {
        method: 'GET',
        baseUrl: TEST_REGISTRY_URL,
        accept: 'application/vnd.superface.profile+json',
        headers: [`Authorization: SUPERFACE-SDK-TOKEN ${TEST_SDK_TOKEN}`],
      });
    });

    it('fetches profile ast without scope', async () => {
      const mockResponse = {
        statusCode: 200,
        body: JSON.stringify(mockProfileDocument),
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

      const profileId = 'test-profile-id@1.0.0';
      await expect(
        fetchProfileAst(profileId, config, crypto, new NodeFetch(timers))
      ).resolves.toEqual(mockProfileDocument);

      expect(request).toHaveBeenCalledTimes(1);
      expect(request).toHaveBeenCalledWith(`/${profileId}`, {
        method: 'GET',
        baseUrl: TEST_REGISTRY_URL,
        accept: 'application/vnd.superface.profile+json',
        headers: [`Authorization: SUPERFACE-SDK-TOKEN ${TEST_SDK_TOKEN}`],
      });
    });

    it('throws error on invalid status code and response body with detail', async () => {
      const mockBody = {
        detail: 'Test',
        title: 'Title',
      };
      const mockResponse = {
        statusCode: 400,
        body: mockBody,
        headers: { 'content-type': `${JSON_PROBLEM_CONTENT}; charset=utf-8` },
        debug: {
          request: {
            headers: { test: 'test' },
            url: 'test',
            body: {},
          },
        },
      };

      request.mockResolvedValue(mockResponse);

      const profileId = 'test-profile-id@1.0.0';
      await expect(
        fetchProfileAst(profileId, config, crypto, new NodeFetch(timers))
      ).rejects.toEqual(invalidResponseError(400, mockBody));

      expect(request).toHaveBeenCalledTimes(1);
      expect(request).toHaveBeenCalledWith(`/${profileId}`, {
        method: 'GET',
        baseUrl: TEST_REGISTRY_URL,
        accept: 'application/vnd.superface.profile+json',
        headers: [`Authorization: SUPERFACE-SDK-TOKEN ${TEST_SDK_TOKEN}`],
      });
    });
  });

  describe('when fetching map source', () => {
    const TEST_REGISTRY_URL = 'https://example.com/test-registry';
    const TEST_SDK_TOKEN =
      'sfs_bb064dd57c302911602dd097bc29bedaea6a021c25a66992d475ed959aa526c7_37bce8b5';
    const config = new Config(NodeFileSystem, {
      superfaceApiUrl: TEST_REGISTRY_URL,
      sdkAuthToken: TEST_SDK_TOKEN,
    });

    it('fetches map source with map variant', async () => {
      const mockMapSOurce = 'source';
      const mockResponse = {
        statusCode: 200,
        body: mockMapSOurce,
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

      const mapId = 'test-profile-id.test-provider.test-map-variant@1.0.0';
      await expect(
        fetchMapSource(mapId, config, crypto, new NodeFetch(timers))
      ).resolves.toEqual(mockMapSOurce);

      expect(request).toHaveBeenCalledTimes(1);
      expect(request).toHaveBeenCalledWith(`/${mapId}`, {
        method: 'GET',
        baseUrl: TEST_REGISTRY_URL,
        accept: 'application/vnd.superface.map',
        headers: [`Authorization: SUPERFACE-SDK-TOKEN ${TEST_SDK_TOKEN}`],
      });
    });

    it('fetches map source without map variant', async () => {
      const mockMapSource = 'source';
      const mockResponse = {
        statusCode: 200,
        body: mockMapSource,
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

      const mapId = 'test-profile-id.test-provider@1.0.0';
      await expect(
        fetchMapSource(mapId, config, crypto, new NodeFetch(timers))
      ).resolves.toEqual(mockMapSource);

      expect(request).toHaveBeenCalledTimes(1);
      expect(request).toHaveBeenCalledWith(`/${mapId}`, {
        method: 'GET',
        baseUrl: TEST_REGISTRY_URL,
        accept: 'application/vnd.superface.map',
        headers: [`Authorization: SUPERFACE-SDK-TOKEN ${TEST_SDK_TOKEN}`],
      });
    });
  });
});
