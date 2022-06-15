/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  ApiKeyPlacement,
  AstMetadata,
  HttpScheme,
  MapDocumentNode,
  ProfileDocumentNode,
  ProviderJson,
  SecurityType,
} from '@superfaceai/ast';

import { SuperJson } from '../internal';
import { ok } from '../lib/result/result';
import { ServiceSelector } from '../lib/services';
import { SuperfaceClient } from './client';
import { Profile, ProfileConfiguration } from './profile';
import { BoundProfileProvider } from './profile-provider';
import { Provider, ProviderConfiguration } from './provider';
import { UseCase } from './usecase';

//Mock SuperJson static side
const mockLoadSync = jest.fn();

//Mock profile provider
jest.mock('./profile-provider');

const astMetadata: AstMetadata = {
  sourceChecksum: 'checksum',
  astVersion: {
    major: 1,
    minor: 0,
    patch: 0,
    label: undefined,
  },
  parserVersion: {
    major: 1,
    minor: 0,
    patch: 0,
    label: undefined,
  },
};

describe('UseCase', () => {
  const mockSuperJson = new SuperJson({
    profiles: {
      test: {
        version: '1.0.0',
      },
    },
    providers: {},
  });
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
    header: {
      kind: 'ProfileHeader',
      name: 'test-profile',
      version: {
        major: 1,
        minor: 0,
        patch: 0,
      },
    },
    definitions: [],
  };

  const mockProviderJson: ProviderJson = {
    name: 'test',
    services: [{ id: 'test-service', baseUrl: 'service/base/url' }],
    securitySchemes: [
      {
        type: SecurityType.HTTP,
        id: 'basic',
        scheme: HttpScheme.BASIC,
      },
      {
        id: 'api',
        type: SecurityType.APIKEY,
        in: ApiKeyPlacement.HEADER,
        name: 'Authorization',
      },
      {
        id: 'bearer',
        type: SecurityType.HTTP,
        scheme: HttpScheme.BEARER,
        bearerFormat: 'some',
      },
      {
        id: 'digest',
        type: SecurityType.HTTP,
        scheme: HttpScheme.DIGEST,
      },
    ],
    defaultService: 'test-service',
  };

  beforeEach(() => {
    mockLoadSync.mockReturnValue(ok(mockSuperJson));
    SuperJson.loadSync = mockLoadSync;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('when calling perform', () => {
    it('passes security values', async () => {
      const mockBoundProfileProvider = new BoundProfileProvider(
        mockProfileDocument,
        mockMapDocument,
        mockProviderJson,
        { services: ServiceSelector.withDefaultUrl(''), security: [] }
      );
      const mockClient = new SuperfaceClient();

      const mockProfileConfiguration = new ProfileConfiguration(
        'test',
        '1.0.0'
      );
      const mockProfile = new Profile(mockClient, mockProfileConfiguration);

      const mockProviderConfiguration = new ProviderConfiguration(
        'test-provider',
        []
      );
      const mockProvider = new Provider(mockClient, mockProviderConfiguration);

      const getProviderForProfileSpy = jest
        .spyOn(mockClient, 'getProviderForProfile')
        .mockResolvedValue(mockProvider);
      const cacheBoundProfileProviderSpy = jest
        .spyOn(mockClient, 'cacheBoundProfileProvider')
        .mockResolvedValue(mockBoundProfileProvider);

      const usecase = new UseCase(mockProfile, 'test-usecase');
      await expect(
        usecase.perform(
          { x: 7 },
          {
            security: [
              {
                id: 'test',
                apikey: 'key',
              },
            ],
          }
        )
      ).resolves.toBeUndefined();

      expect(getProviderForProfileSpy).toHaveBeenCalledTimes(1);
      expect(getProviderForProfileSpy).toHaveBeenCalledWith('test');

      expect(cacheBoundProfileProviderSpy).toHaveBeenCalledTimes(1);
      expect(cacheBoundProfileProviderSpy).toHaveBeenCalledWith(
        mockProfileConfiguration,
        new ProviderConfiguration('test-provider', [])
      );
    });

    it('calls getProviderForProfile when there is no provider config', async () => {
      const mockBoundProfileProvider = new BoundProfileProvider(
        mockProfileDocument,
        mockMapDocument,
        mockProviderJson,
        { services: ServiceSelector.withDefaultUrl(''), security: [] }
      );
      const mockClient = new SuperfaceClient();

      const mockProfileConfiguration = new ProfileConfiguration(
        'test',
        '1.0.0'
      );
      const mockProfile = new Profile(mockClient, mockProfileConfiguration);

      const mockProviderConfiguration = new ProviderConfiguration(
        'test-provider',
        []
      );
      const mockProvider = new Provider(mockClient, mockProviderConfiguration);

      const getProviderForProfileSpy = jest
        .spyOn(mockClient, 'getProviderForProfile')
        .mockResolvedValue(mockProvider);
      const cacheBoundProfileProviderSpy = jest
        .spyOn(mockClient, 'cacheBoundProfileProvider')
        .mockResolvedValue(mockBoundProfileProvider);

      const usecase = new UseCase(mockProfile, 'test-usecase');
      await expect(usecase.perform({ x: 7 })).resolves.toBeUndefined();

      expect(getProviderForProfileSpy).toHaveBeenCalledTimes(1);
      expect(getProviderForProfileSpy).toHaveBeenCalledWith('test');

      expect(cacheBoundProfileProviderSpy).toHaveBeenCalledTimes(1);
      expect(cacheBoundProfileProviderSpy).toHaveBeenCalledWith(
        mockProfileConfiguration,
        mockProviderConfiguration
      );
    });

    it('does not call getProviderForProfile when there is provider config', async () => {
      const mockResult = { test: 'test' };
      const mockBoundProfileProvider = new BoundProfileProvider(
        mockProfileDocument,
        mockMapDocument,
        mockProviderJson,
        { services: ServiceSelector.withDefaultUrl(''), security: [] }
      );
      const mockClient = new SuperfaceClient();

      const mockProfileConfiguration = new ProfileConfiguration(
        'test',
        '1.0.0'
      );
      const mockProfile = new Profile(mockClient, mockProfileConfiguration);

      const mockProviderConfiguration = new ProviderConfiguration(
        'test-provider',
        []
      );
      const mockProvider = new Provider(mockClient, mockProviderConfiguration);

      const getProviderForProfileSpy = jest.spyOn(
        mockClient,
        'getProviderForProfile'
      );
      const cacheBoundProfileProviderSpy = jest
        .spyOn(mockClient, 'cacheBoundProfileProvider')
        .mockResolvedValue(mockBoundProfileProvider);
      const performSpy = jest
        .spyOn(mockBoundProfileProvider, 'perform')
        .mockResolvedValue(ok(mockResult));

      const usecase = new UseCase(mockProfile, 'test-usecase');
      await expect(
        usecase.perform(undefined, { provider: mockProvider })
      ).resolves.toEqual(ok(mockResult));

      expect(getProviderForProfileSpy).not.toHaveBeenCalled();

      expect(cacheBoundProfileProviderSpy).toHaveBeenCalledTimes(1);
      expect(cacheBoundProfileProviderSpy).toHaveBeenCalledWith(
        mockProfileConfiguration,
        mockProviderConfiguration
      );

      expect(performSpy).toHaveBeenCalledTimes(1);
      expect(performSpy).toHaveBeenCalledWith(
        'test-usecase',
        undefined,
        undefined,
        undefined
      );
    });
  });
});
