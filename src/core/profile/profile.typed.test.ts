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
import { Events } from '../events';
import type { IBoundProfileProvider } from '../profile-provider';
import { PureJSSandbox } from '../sandbox';
import { UseCase } from '../usecase';
import { TypedProfile } from './profile.typed';
import { ProfileConfiguration } from './profile-configuration';

const crypto = new NodeCrypto();

describe('TypedProfile', () => {
  const mockSuperJson = normalizeSuperJsonDocument(
    {
      profiles: {
        test: {
          version: '1.0.0',
        },
      },
      providers: {},
    },
    new MockEnvironment()
  );
  const mockProfileConfiguration = new ProfileConfiguration('test', '1.0.0');
  const ast = mockProfileDocumentNode();

  const timers = new MockTimers();
  const events = new Events(timers);
  const cache = new SuperCache<{
    provider: IBoundProfileProvider;
    expiresAt: number;
  }>();
  const config = new Config(NodeFileSystem);
  const sandbox = new PureJSSandbox();
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
        sandbox,
        timers,
        fileSystem,
        crypto,
        new NodeFetch(timers),
        ['sayHello']
      );

      expect(typedProfile.getUseCase('sayHello')).toEqual(
        new UseCase(
          typedProfile,
          'sayHello',
          events,
          config,
          sandbox,
          mockSuperJson,
          timers,
          fileSystem,
          crypto,
          cache,
          new NodeFetch(timers)
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
        sandbox,
        timers,
        fileSystem,
        crypto,
        new NodeFetch(timers),
        ['sayHello']
      );

      expect(() => typedProfile.getUseCase('nope')).toThrow(
        new RegExp('Usecase not found: "nope"')
      );
    });
  });
});
