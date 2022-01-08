import { Config } from '../config';
import { SuperJson } from '../internal';
import { Events } from '../lib/events';
import { SuperCache } from './cache';
import { Profile, ProfileConfiguration } from './profile';
import { IBoundProfileProvider } from './profile-provider';

function createProfile(): Profile {
  const events = new Events();
  const cache = new SuperCache<IBoundProfileProvider>();
  const config = new Config();
  const configuration = new ProfileConfiguration('test', '1.0.0');
  const superJson = new SuperJson({
    profiles: {
      test: {
        version: '1.0.0',
      },
    },
    providers: {},
  });

  return new Profile(configuration, events, superJson, config, cache);
}

describe('Profile', () => {
  it('should call getUseCases correctly', async () => {
    const profile = createProfile();

    expect(profile.getUseCase('sayHello')).toMatchObject({
      name: 'sayHello',
      profileConfiguration: profile.configuration,
    });
  });
});
