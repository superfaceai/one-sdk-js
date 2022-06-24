import { Events, IBoundProfileProvider, UseCase } from '~core';
import { SuperCache } from '~lib';
import { MockEnvironment, MockFileSystem, MockTimers } from '~mock';
import { NodeCrypto } from '~node';
import { SuperJson } from '~schema-tools';

import { Config } from '../config';
import { ProfileConfiguration } from './profile';
import { TypedProfile } from './profile.typed';

const crypto = new NodeCrypto();

describe('TypedProfile', () => {
  const mockSuperJson = new SuperJson({
    profiles: {
      test: {
        version: '1.0.0',
      },
    },
    providers: {},
  });
  const mockProfileConfiguration = new ProfileConfiguration('test', '1.0.0');

  const timers = new MockTimers();
  const events = new Events(timers);
  const cache = new SuperCache<{
    provider: IBoundProfileProvider;
    expiresAt: number;
  }>();
  const environment = new MockEnvironment();
  const config = new Config(environment);
  const fileSystem = MockFileSystem();

  describe('getUseCases', () => {
    it('should get usecase correctly', async () => {
      const typedProfile = new TypedProfile(
        mockProfileConfiguration,
        events,
        mockSuperJson,
        cache,
        config,
        timers,
        fileSystem,
        crypto,
        ['sayHello']
      );

      expect(typedProfile.getUseCase('sayHello')).toEqual(
        new UseCase(
          mockProfileConfiguration,
          'sayHello',
          events,
          config,
          mockSuperJson,
          timers,
          fileSystem,
          crypto,
          cache
        )
      );
    });

    it('should throw when usecase is not found', async () => {
      const typedProfile = new TypedProfile(
        mockProfileConfiguration,
        events,
        mockSuperJson,
        cache,
        config,
        timers,
        fileSystem,
        crypto,
        ['sayHello']
      );

      expect(() => typedProfile.getUseCase('nope')).toThrow(
        new RegExp('Usecase not found: "nope"')
      );
    });
  });
});
