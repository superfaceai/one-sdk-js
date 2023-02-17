import type { SuperJsonDocument } from '@superfaceai/ast';

import { SuperCache } from '../../lib';
import { mockProfileDocumentNode, MockTimers } from '../../mock';
import {
  NodeCrypto,
  NodeEnvironment,
  NodeFetch,
  NodeFileSystem,
} from '../../node';
import { normalizeSuperJsonDocument } from '../../schema-tools/superjson/normalize';
import { Config } from '../config';
import { usecaseNotFoundError } from '../errors';
import { Events } from '../events';
import type { IBoundProfileProvider } from '../profile-provider';
import { PureJSSandbox } from '../sandbox';
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
  const sandbox = new PureJSSandbox();
  const ast = mockProfileDocumentNode({ usecaseName: 'sayHello' });
  const configuration = new ProfileConfiguration('test', '1.0.0');

  return new Profile(
    configuration,
    ast,
    events,
    normalizeSuperJsonDocument(superJson, new NodeEnvironment()),
    config,
    sandbox,
    timers,
    NodeFileSystem,
    cache,
    crypto,
    new NodeFetch(timers)
  );
}

describe('Profile', () => {
  describe('when calling getUseCases', () => {
    it('should return new UseCase', async () => {
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

    it('should throw on non existent use case name', async () => {
      const superJson = {
        profiles: {
          test: {
            version: '1.0.0',
          },
        },
        providers: {},
      };
      const profile = createProfile(superJson);

      expect(() => profile.getUseCase('made-up')).toThrow(
        usecaseNotFoundError('made-up', ['sayHello'])
      );
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
