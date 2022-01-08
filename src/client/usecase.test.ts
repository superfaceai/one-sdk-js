import { Config } from '../config';
import { SuperJson } from '../internal';
import { Events } from '../lib/events';
import { SuperCache } from './cache';
import { registerHooks } from './failure/event-adapter';
import { ProfileConfiguration } from './profile';
import { IBoundProfileProvider } from './profile-provider';
import { ProviderConfiguration } from './provider';
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

describe('UseCase', () => {
  function createUseCase() {
    const events = new Events();
    registerHooks(events);

    const mockProfileConfiguration = new ProfileConfiguration('test', '1.0.0');

    const mockBoundProfileProvider = {
      perform: jest.fn(),
    };
    const mockBoundProfileProvider2 = {
      perform: jest.fn(),
    };

    const cache = new SuperCache<IBoundProfileProvider>();
    cache.getCached(
      mockProfileConfiguration.cacheKey +
        new ProviderConfiguration('test-provider', []).cacheKey,
      () => mockBoundProfileProvider
    );
    cache.getCached(
      mockProfileConfiguration.cacheKey +
        new ProviderConfiguration('test-provider2', []).cacheKey,
      () => mockBoundProfileProvider2
    );

    const config = new Config();

    const usecase = new UseCase(
      mockProfileConfiguration,
      'test-usecase',
      events,
      config,
      mockSuperJson,
      cache
    );

    return {
      performSpy: mockBoundProfileProvider.perform,
      performSpy2: mockBoundProfileProvider2.perform,
      usecase,
    };
  }

  describe('when calling perform', () => {
    it('calls perform on correct BoundProfileProvider', async () => {
      const { usecase, performSpy } = createUseCase();
      await expect(usecase.perform({ x: 7 })).resolves.toBeUndefined();
      expect(performSpy).toHaveBeenCalledWith('test-usecase', { x: 7 });
    });

    it('calls perform on overridden BoundProfileProvider', async () => {
      const { usecase, performSpy, performSpy2 } = createUseCase();
      await expect(
        usecase.perform({ x: 7 }, { provider: 'test-provider2' })
      ).resolves.toBeUndefined();
      expect(performSpy).not.toHaveBeenCalled();
      expect(performSpy2).toHaveBeenCalledWith('test-usecase', { x: 7 });
    });
  });
});
