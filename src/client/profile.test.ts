import { SuperJsonDocument } from '@superfaceai/ast';

import { Config } from '../config';
import { SuperJson } from '../internal';
import { Events } from '../lib/events';
import { NodeFileSystem } from '../lib/io/filesystem.node';
import { MockFileSystem } from '../test/filesystem';
import { SuperCache } from './cache';
import { Profile, ProfileConfiguration, TypedProfile } from './profile';
import { IBoundProfileProvider } from './profile-provider';
import { UseCase } from './usecase';

function createProfile(superJson: SuperJsonDocument): Profile {
  const events = new Events();
  const cache = new SuperCache<{
    provider: IBoundProfileProvider;
    expiresAt: number;
  }>();
  const config = new Config();
  const configuration = new ProfileConfiguration('test', '1.0.0');

  return new Profile(
    configuration,
    events,
    new SuperJson(superJson),
    config,
    NodeFileSystem,
    cache
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

  const events = new Events();
  const cache = new SuperCache<{
    provider: IBoundProfileProvider;
    expiresAt: number;
  }>();
  const config = new Config();
  const fileSystem = MockFileSystem();

  describe('getUseCases', () => {
    it('should get usecase correctly', async () => {
      const typedProfile = new TypedProfile(
        mockProfileConfiguration,
        events,
        mockSuperJson,
        cache,
        config,
        fileSystem,
        ['sayHello']
      );

      expect(typedProfile.getUseCase('sayHello')).toEqual(
        new UseCase(
          mockProfileConfiguration,
          'sayHello',
          events,
          config,
          mockSuperJson,
          fileSystem,
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
        fileSystem,
        ['sayHello']
      );

      expect(() => typedProfile.getUseCase('nope')).toThrow(
        new RegExp('Usecase not found: "nope"')
      );
    });
  });
});
