import {
  Events,
  IBoundProfileProvider,
  ProfileConfiguration,
  Provider,
  ProviderConfiguration,
  registerHooks,
} from '~core';
import { SuperCache } from '~lib';
import { MockFileSystem, MockTimers } from '~mock';
import { NodeCrypto } from '~node';
import { SuperJson } from '~schema-tools';
import * as utils from '~schema-tools/superjson/utils';

import { Config } from '../config';
import { UseCase } from './usecase';

const mockSuperJson = new SuperJson({
  profiles: {
    test: {
      version: '1.0.0',
    },
  },
  providers: {
    'test-provider': {},
    'test-provider2': {},
  },
});

const mockBoundProfileProvider = {
  perform: jest.fn(),
};

jest.mock('../profile-provider', () => ({
  bindProfileProvider: jest.fn(() => mockBoundProfileProvider),
}));

function createUseCase(cacheExpire?: number) {
  const crypto = new NodeCrypto();
  const timers = new MockTimers();
  const events = new Events(timers);
  registerHooks(events, timers);

  const mockProfileConfiguration = new ProfileConfiguration('test', '1.0.0');

  const mockBoundProfileProvider2 = {
    perform: jest.fn(),
  };

  const cache = new SuperCache<{
    provider: IBoundProfileProvider;
    expiresAt: number;
  }>();
  cache.getCached(
    mockProfileConfiguration.cacheKey +
      new ProviderConfiguration('test-provider', []).cacheKey,
    () => ({
      provider: mockBoundProfileProvider,
      expiresAt: cacheExpire ?? Infinity,
    })
  );
  cache.getCached(
    mockProfileConfiguration.cacheKey +
      new ProviderConfiguration('test-provider2', []).cacheKey,
    () => ({
      provider: mockBoundProfileProvider2,
      expiresAt: cacheExpire ?? Infinity,
    })
  );

  const filesystem = MockFileSystem();

  const config = new Config();

  const usecase = new UseCase(
    mockProfileConfiguration,
    'test-usecase',
    events,
    config,
    mockSuperJson,
    timers,
    filesystem,
    crypto,
    cache
  );

  return {
    performSpy: mockBoundProfileProvider.perform,
    performSpy2: mockBoundProfileProvider2.perform,
    usecase,
    cache,
    timers,
  };
}

describe('UseCase', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('when calling perform', () => {
    it('passes security values', async () => {
      const { usecase, performSpy } = createUseCase();
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

      expect(performSpy).toHaveBeenCalledWith(
        'test-usecase',
        { x: 7 },
        undefined,
        [{ id: 'test', apikey: 'key' }]
      );
    });

    it('calls perform on correct BoundProfileProvider', async () => {
      const { usecase, performSpy } = createUseCase();
      await expect(usecase.perform({ x: 7 })).resolves.toBeUndefined();
      expect(performSpy).toHaveBeenCalledWith(
        'test-usecase',
        { x: 7 },
        undefined,
        undefined
      );
    });

    it('calls getProviderForProfile when there is no provider config', async () => {
      const getProviderForProfileSpy = jest.spyOn(
        utils,
        'getProviderForProfile'
      );
      const { usecase, performSpy } = createUseCase();
      await expect(usecase.perform({ x: 7 })).resolves.toBeUndefined();
      expect(performSpy).toHaveBeenCalledWith(
        'test-usecase',
        { x: 7 },
        undefined,
        undefined
      );
      expect(getProviderForProfileSpy).toHaveBeenCalledWith(
        mockSuperJson,
        'test'
      );
    });

    it('does not call getProviderForProfile when there is provider config', async () => {
      const mockProviderConfiguration = new ProviderConfiguration(
        'test-provider',
        []
      );
      const mockProvider = new Provider(mockProviderConfiguration);
      const getProviderForProfileSpy = jest.spyOn(
        utils,
        'getProviderForProfile'
      );
      const { usecase, performSpy } = createUseCase();
      await expect(
        usecase.perform({ x: 7 }, { provider: mockProvider })
      ).resolves.toBeUndefined();
      expect(performSpy).toHaveBeenCalledWith(
        'test-usecase',
        { x: 7 },
        undefined,
        undefined
      );
      expect(getProviderForProfileSpy).not.toHaveBeenCalled();
    });

    it('calls perform on overridden BoundProfileProvider', async () => {
      const { usecase, performSpy, performSpy2 } = createUseCase();
      await expect(
        usecase.perform({ x: 7 }, { provider: 'test-provider2' })
      ).resolves.toBeUndefined();
      expect(performSpy).not.toHaveBeenCalled();
      expect(performSpy2).toHaveBeenCalledWith(
        'test-usecase',
        { x: 7 },
        undefined,
        undefined
      );
    });
  });

  it('rebinds profile provider when timeout expires', async () => {
    const expiry = Math.floor(Date.now() / 1000) + 1000 * 60 * 60;
    const { usecase, cache, timers } = createUseCase(expiry);
    const invalidateSpy = jest.spyOn(cache, 'invalidate');

    await usecase.perform();
    expect(invalidateSpy).not.toHaveBeenCalled();

    timers.tick((1000 + 1000 * 60 * 60) * 1000);

    await usecase.perform();
    expect(invalidateSpy).toHaveBeenCalled();
  });
});
