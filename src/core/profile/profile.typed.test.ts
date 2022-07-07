import { SuperCache } from '../../lib';
import {
  MockFileSystem,
  mockProfileDocumentNode,
  MockTimers,
} from '../../mock';
import { CrossFetch, NodeCrypto, NodeFileSystem } from '../../node';
import { SuperJson } from '../../schema-tools';
import { Config } from '../config';
import { Events } from '../events';
import { IBoundProfileProvider } from '../profile-provider';
import { UseCase } from '../usecase';
import { TypedProfile } from './profile.typed';
import { ProfileConfiguration } from './profile-configuration';

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
  const ast = mockProfileDocumentNode();

  const timers = new MockTimers();
  const events = new Events(timers);
  const cache = new SuperCache<{
    provider: IBoundProfileProvider;
    expiresAt: number;
  }>();
  const config = new Config(NodeFileSystem);
  const fileSystem = MockFileSystem();

  describe('getUseCases', () => {
    it('should get usecase correctly', async () => {
      const typedProfile = new TypedProfile(
        mockProfileConfiguration,
        ast,
        events,
        mockSuperJson,
        cache,
        config,
        timers,
        fileSystem,
        crypto,
        new CrossFetch(timers),
        ['sayHello']
      );

      expect(typedProfile.getUseCase('sayHello')).toEqual(
        new UseCase(
          typedProfile,
          'sayHello',
          events,
          config,
          mockSuperJson,
          timers,
          fileSystem,
          crypto,
          cache,
          new CrossFetch(timers)
        )
      );
    });

    it('should throw when usecase is not found', async () => {
      const typedProfile = new TypedProfile(
        mockProfileConfiguration,
        mockProfileDocumentNode(),
        events,
        mockSuperJson,
        cache,
        config,
        timers,
        fileSystem,
        crypto,
        new CrossFetch(timers),
        ['sayHello']
      );

      expect(() => typedProfile.getUseCase('nope')).toThrow(
        new RegExp('Usecase not found: "nope"')
      );
    });
  });
});
