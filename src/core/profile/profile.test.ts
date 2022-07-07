import { SuperJsonDocument } from '@superfaceai/ast';

import { SuperCache } from '../../lib';
import { mockProfileDocumentNode, MockTimers } from '../../mock';
import { CrossFetch, NodeCrypto, NodeFileSystem } from '../../node';
import { SuperJson } from '../../schema-tools';
import { Config } from '../config';
import { Events } from '../events';
import { IBoundProfileProvider } from '../profile-provider';
import { Profile } from './profile';
import { ProfileConfiguration } from './profile-configuration';

const crypto = new NodeCrypto();

function createProfile(superJson: SuperJsonDocument): Profile {
  const timers = new MockTimers();
  const events = new Events(timers);
  const cache = new SuperCache<{
    provider: IBoundProfileProvider;
    expiresAt: number;
  }>();
  const config = new Config(NodeFileSystem);
  const ast = mockProfileDocumentNode({ usecaseName: 'sayHello' });
  const configuration = new ProfileConfiguration('test', '1.0.0');

  return new Profile(
    configuration,
    ast,
    events,
    new SuperJson(superJson),
    config,
    timers,
    NodeFileSystem,
    cache,
    crypto,
    new CrossFetch(timers)
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
