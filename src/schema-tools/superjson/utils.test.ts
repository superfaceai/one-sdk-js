import { SecurityValues } from '@superfaceai/ast';

import {
  Provider,
  ProviderConfiguration,
  unconfiguredProviderError,
} from '../../core';
import { SuperJson } from './superjson';
import { getProvider } from './utils';

describe('schema-tools utils', () => {
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

    it('retrun correct provider instance', () => {
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

    it('retrun correct provider instance with custom security and parameters', () => {
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
