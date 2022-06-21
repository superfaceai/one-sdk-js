import { SuperJsonDocument } from '@superfaceai/ast';

import { Config } from '../config';
import { SuperJson } from '../internal';
import { NodeCrypto } from '../lib/crypto';
import { Events } from '../lib/events';
import { NodeFileSystem } from '../lib/io/filesystem.node';
import { MockEnvironment } from '../test/environment';
import { MockTimers } from '../test/timers';
import { IBoundProfileProvider } from './bound-profile-provider';
import { SuperCache } from './cache';
import { Profile, ProfileConfiguration } from './profile';

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
