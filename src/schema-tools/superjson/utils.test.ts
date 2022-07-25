import { SecurityValues } from '@superfaceai/ast';

import {
  Provider,
  ProviderConfiguration,
  unconfiguredProviderError,
} from '../../core';
import { SuperJson } from './superjson';
import { getProvider, getProviderForProfile } from './utils';

describe('schema-tools utils', () => {
  describe('getProviderForProfile', () => {
    it('throws when providers are not configured', async () => {
      expect(() =>
        getProviderForProfile(
          new SuperJson({
            profiles: {
              test: '2.1.0',
            },
            providers: {
              quz: {},
            },
          }),
          'foo'
        )
      ).toThrow(
        'Profile "foo" needs at least one configured provider for automatic provider selection'
      );
    });

    it('returns a configured provider when present', async () => {
      const provider = getProviderForProfile(
        new SuperJson({
          profiles: {
            baz: {
              version: '1.2.3',
              providers: {
                quz: {},
              },
            },
          },
          providers: {
            quz: {},
          },
        }),
        'baz'
      );
      expect(provider.configuration.name).toBe('quz');
    });
  });

  describe('getProvider', () => {
    const mockSecurityValues: SecurityValues[] = [
      {
        username: 'test-username',
        id: 'basic',
        password: 'test-password',
      },
      {
        id: 'api',
        apikey: 'test-api-key',
      },
      {
        id: 'bearer',
        token: 'test-token',
      },
      {
        id: 'digest',
        username: 'test-digest-user',
        password: 'test-digest-password',
      },
    ];

    const mockParameters = {
      first: 'plain value',
      second: '$TEST_SECOND', // unset env value without default
      third: '$TEST_THIRD', // unset env value with default
      // fourth is missing - should be resolved to its default
    };

    it('throws on unconfigured provider', () => {
      expect(() => getProvider(new SuperJson(), 'test')).toThrow(
        unconfiguredProviderError('test')
      );
    });

    it('return correct provider instance', () => {
      const superJson = new SuperJson({
        profiles: {
          'test-profile': {
            version: '1.0.0',
            defaults: {},
            providers: {},
          },
        },
        providers: {
          test: {
            security: mockSecurityValues,
            parameters: mockParameters,
          },
        },
      });
      expect(getProvider(superJson, 'test')).toEqual(
        new Provider(
          new ProviderConfiguration('test', mockSecurityValues, mockParameters)
        )
      );
    });

    it('return correct provider instance with custom security and parameters', () => {
      const superJson = new SuperJson({
        profiles: {
          'test-profile': {
            version: '1.0.0',
            defaults: {},
            providers: {},
          },
        },
        providers: {
          test: {
            security: [],
            parameters: {},
          },
        },
      });
      expect(
        getProvider(superJson, 'test', mockSecurityValues, mockParameters)
      ).toEqual(
        new Provider(
          new ProviderConfiguration('test', mockSecurityValues, mockParameters)
        )
      );
    });
  });
});
