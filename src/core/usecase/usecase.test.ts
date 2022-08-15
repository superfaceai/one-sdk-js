import { SuperCache } from '../../lib';
import {
  MockEnvironment,
  MockFileSystem,
  mockProfileDocumentNode,
  MockTimers,
} from '../../mock';
import { NodeCrypto, NodeFetch, NodeFileSystem } from '../../node';
import { normalizeSuperJsonDocument } from '../../schema-tools/superjson/normalize';
import { Config } from '../config';
import { Events, registerHooks } from '../events';
import type { ProfileBase } from '../profile';
import { Profile, ProfileConfiguration } from '../profile';
import type { IBoundProfileProvider } from '../profile-provider';
import { ProfileProviderConfiguration } from '../profile-provider';
import { ProviderConfiguration } from '../provider';
import { UseCase } from './usecase';

const mockSuperJson = normalizeSuperJsonDocument(
  {
    profiles: {
      test: {
        version: '1.0.0',
      },
    },
    providers: {
      'test-provider': {},
      'test-provider2': {},
    },
  },
  new MockEnvironment()
);

const mockBoundProfileProvider = {
  perform: jest.fn(),
};

jest.mock('../profile-provider/profile-provider', () => ({
  bindProfileProvider: jest.fn(() => mockBoundProfileProvider),
}));

function createUseCase(cacheExpire?: number, omitSuperJson?: boolean) {
  const crypto = new NodeCrypto();
  const timers = new MockTimers();
  const events = new Events(timers);
  registerHooks(events, timers);

  const mockProfileConfiguration = new ProfileConfiguration('test', '1.0.0');

  const mockBoundProfileProvider2 = {
    perform: jest.fn(),
  };

  const mockProviderConfiguration = new ProviderConfiguration(
    'test-provider',
    []
  );
  const mockProviderConfiguration2 = new ProviderConfiguration(
    'test-provider2',
    []
  );

  const cache = new SuperCache<{
    provider: IBoundProfileProvider;
    expiresAt: number;
  }>();

  const filesystem = MockFileSystem();

  const config = new Config(NodeFileSystem);

  const profile: ProfileBase = new Profile(
    mockProfileConfiguration,
    mockProfileDocumentNode(),
    events,
    omitSuperJson === true ? undefined : mockSuperJson,
    config,
    timers,
    filesystem,
    cache,
    crypto,
    new NodeFetch(timers)
  );

  cache.getCached(
    mockProfileConfiguration.cacheKey + mockProviderConfiguration.cacheKey,
    () => ({
      provider: mockBoundProfileProvider,
      expiresAt: cacheExpire ?? Infinity,
    })
  );
  cache.getCached(
    mockProfileConfiguration.cacheKey + mockProviderConfiguration2.cacheKey,
    () => ({
      provider: mockBoundProfileProvider2,
      expiresAt: cacheExpire ?? Infinity,
    })
  );

  const usecase = new UseCase(
    profile,
    'test-usecase',
    events,
    config,
    omitSuperJson === true ? undefined : mockSuperJson,
    timers,
    filesystem,
    crypto,
    cache,
    new NodeFetch(timers)
  );

  return {
    performSpy: mockBoundProfileProvider.perform,
    performSpy2: mockBoundProfileProvider2.perform,
    profileConfiguration: mockProfileConfiguration,
    providerConfiguration: mockProviderConfiguration,
    providerConfiguration2: mockProviderConfiguration2,
    usecase,
    cache,
    timers,
  };
}

describe('UseCase', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('when using without super json', () => {
    describe('when calling perform', () => {
      it('passes security values when entered as array', async () => {
        const { usecase, performSpy } = createUseCase(undefined, true);
        await expect(
          usecase.perform(
            { x: 7 },
            {
              provider: 'test-provider',
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

      it('passes security values when entered as object', async () => {
        const { usecase, performSpy } = createUseCase(undefined, true);
        await expect(
          usecase.perform(
            { x: 7 },
            {
              provider: 'test-provider',
              security: {
                test: {
                  apikey: 'key',
                },
              },
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

      it('does not pass security values when not supported', async () => {
        const { usecase, performSpy } = createUseCase(undefined, true);
        await expect(
          usecase.perform(
            { x: 7 },
            {
              provider: 'test-provider',
              security: {
                test: {
                  foo: 'key',
                },
              },
            }
          )
        ).resolves.toBeUndefined();

        expect(performSpy).toHaveBeenCalledWith(
          'test-usecase',
          { x: 7 },
          undefined,
          []
        );
      });

      it('passes map variant and map revision', async () => {
        const {
          usecase,
          performSpy,
          profileConfiguration,
          providerConfiguration,
        } = createUseCase(undefined, true);

        const rebindSpy = jest.spyOn(usecase as any, 'rebind');
        await expect(
          usecase.perform(
            { x: 7 },
            {
              provider: 'test-provider',
              security: [
                {
                  id: 'test',
                  apikey: 'key',
                },
              ],
              mapRevision: 'rev',
              mapVariant: 'var',
            }
          )
        ).resolves.toBeUndefined();

        expect(rebindSpy).toBeCalledWith(
          profileConfiguration.cacheKey + providerConfiguration.cacheKey,
          providerConfiguration,
          new ProfileProviderConfiguration('rev', 'var')
        );

        expect(performSpy).toHaveBeenCalledWith(
          'test-usecase',
          { x: 7 },
          undefined,
          [{ id: 'test', apikey: 'key' }]
        );
      });

      it('calls perform on correct BoundProfileProvider', async () => {
        const { usecase, performSpy } = createUseCase(undefined, true);
        await expect(
          usecase.perform(
            { x: 7 },
            {
              provider: 'test-provider',
            }
          )
        ).resolves.toBeUndefined();
        expect(performSpy).toHaveBeenCalledWith(
          'test-usecase',
          { x: 7 },
          undefined,
          undefined
        );
      });

      it('calls perform on overridden BoundProfileProvider', async () => {
        const { usecase, performSpy, performSpy2 } = createUseCase(
          undefined,
          true
        );
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
  });

  describe('when using with super json', () => {
    describe('when calling perform', () => {
      it('passes security values when entered as array', async () => {
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

      it('passes security values when entered as object', async () => {
        const { usecase, performSpy } = createUseCase();
        await expect(
          usecase.perform(
            { x: 7 },
            {
              security: {
                test: {
                  apikey: 'key',
                },
              },
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

      it('does not pass security values when not supported', async () => {
        const { usecase, performSpy } = createUseCase();
        await expect(
          usecase.perform(
            { x: 7 },
            {
              security: {
                test: {
                  foo: 'key',
                },
              },
            }
          )
        ).resolves.toBeUndefined();

        expect(performSpy).toHaveBeenCalledWith(
          'test-usecase',
          { x: 7 },
          undefined,
          []
        );
      });

      it('passes map variant and map revision', async () => {
        const {
          usecase,
          performSpy,
          profileConfiguration,
          providerConfiguration,
        } = createUseCase();

        const rebindSpy = jest.spyOn(usecase as any, 'rebind');
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
              mapRevision: 'rev',
              mapVariant: 'var',
            }
          )
        ).resolves.toBeUndefined();

        expect(rebindSpy).toBeCalledWith(
          profileConfiguration.cacheKey + providerConfiguration.cacheKey,
          providerConfiguration,
          new ProfileProviderConfiguration('rev', 'var')
        );

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
