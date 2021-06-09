/* eslint-disable @typescript-eslint/no-unused-vars */
import { MapDocumentNode, ProfileDocumentNode } from '@superfaceai/ast';

import { events, tap } from '../lib/events';
import { ok } from '../lib/result/result';
import { SuperfaceClient } from './client';
import { Profile, ProfileConfiguration } from './profile';
import { BoundProfileProvider } from './profile-provider';
import { Provider, ProviderConfiguration } from './provider';
import { UseCase } from './usecase';

//Mock client
jest.mock('./client');

//Mock profile provider
jest.mock('./profile-provider');

describe('UseCase', () => {
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

  const mockProfileDocument: ProfileDocumentNode = {
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

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('when calling perform', () => {
    it('calls getProviderForProfile when there is no provider config', async () => {
      const mockBoundProfileProvider = new BoundProfileProvider(
        mockProfileDocument,
        mockMapDocument,
        { security: [] }
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
      events.on(
        'pre-perform',
        { priority: 0, filter: { profile: 'netest' } },
        tap((parameters: any) => console.log('called it!', parameters)) as any
      );
      events.on('pre-perform', { priority: 1 }, () => [{ newArg: 7 }]);
      events.on(
        'pre-perform',
        { priority: 2 },
        tap((parameters: any) =>
          console.log('called it again!', parameters)
        ) as any
      );
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
        { security: [] }
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
      expect(performSpy).toHaveBeenCalledWith('test-usecase', undefined);
    });
  });
});
