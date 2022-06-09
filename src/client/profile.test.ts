import { SuperJsonDocument } from '@superfaceai/ast';

import { Config } from '../config';
import { SuperJson } from '../internal';
import { NodeCrypto } from '../lib/crypto';
import { Events } from '../lib/events';
import { NodeFileSystem } from '../lib/io/filesystem.node';
import { MockEnvironment } from '../test/environment';
import { MockFileSystem } from '../test/filesystem';
import { MockTimers } from '../test/timers';
import { SuperCache } from './cache';
import { Profile, ProfileConfiguration, TypedProfile } from './profile';
import { IBoundProfileProvider } from './profile-provider';
import { UseCase } from './usecase';

const crypto = new NodeCrypto();

function createProfile(superJson: SuperJsonDocument): Profile {
  const timers = new MockTimers();
  const events = new Events(timers);
  const cache = new SuperCache<{
    provider: IBoundProfileProvider;
    expiresAt: number;
  }>();
  const environment = new MockEnvironment();
  const config = new Config(environment);
  const configuration = new ProfileConfiguration('test', '1.0.0');

  return new Profile(
    configuration,
    events,
    new SuperJson(superJson),
    config,
    timers,
    NodeFileSystem,
    cache,
    crypto
  );
}

describe('Profile', () => {
  it('should call getUseCases correctly', async () => {
    const superJson = {
      profiles: {
        test: {
          version: '1.0.0',
        },
      },
      providers: {},
    };
    const profile = createProfile(superJson);

    expect(profile.getUseCase('sayHello')).toMatchObject({
      name: 'sayHello',
      profileConfiguration: profile.configuration,
    });
  });

  it('should call getConfiguredProviders correctly', async () => {
    const superJson = {
      profiles: {
        test: {
          version: '1.0.0',
          providers: {
            first: {
              file: '../some.suma',
            },
            second: {
              file: '../some.suma',
            },
          },
        },
      },
      providers: {
        first: {
          file: '../provider.json',
        },
      },
    };
    const profile = createProfile(superJson);

    expect(profile.getConfiguredProviders()).toEqual(['first', 'second']);
  });
});

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
