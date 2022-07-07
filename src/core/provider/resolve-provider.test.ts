import type { SecurityValues } from '@superfaceai/ast';

import { MockEnvironment } from '../../mock';
import { normalizeSuperJsonDocument } from '../../schema-tools/superjson/normalize';
import {
  noConfiguredProviderError,
  profileNotFoundError,
  unableToResolveProviderError,
} from '../errors';
import { Provider, ProviderConfiguration } from './provider';
import { resolveProvider } from './resolve-provider';

describe('ResolveProvider', () => {
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

  const mockSuperJson = (withValues?: boolean) =>
    normalizeSuperJsonDocument(
      {
        profiles: {
          foo: {
            version: '1.0.1',
            providers: {
              bar: {},
            },
          },
          boo: {
            version: '1.2.3',
          },
        },
        providers: {
          bar:
            withValues === true
              ? {
                  security: mockSecurityValues,
                  parameters: mockParameters,
                }
              : {},
        },
      },
      new MockEnvironment()
    );

  describe('when super.json is defined', () => {
    it('should return Provider instance when provider is string', async () => {
      expect(
        resolveProvider({
          superJson: mockSuperJson(),
          provider: 'bar',
        })
      ).toEqual(new Provider(new ProviderConfiguration('bar', [])));
    });

    it('should return Provider instance with exisitng values', async () => {
      expect(
        resolveProvider({
          superJson: mockSuperJson(),
          provider: new Provider(
            new ProviderConfiguration('bar', mockSecurityValues, mockParameters)
          ),
          profileId: 'foo',
        })
      ).toEqual(
        new Provider(
          new ProviderConfiguration('bar', mockSecurityValues, mockParameters)
        )
      );
    });

    it('should return Provider instance with super.json values', async () => {
      expect(
        resolveProvider({
          superJson: mockSuperJson(true),
          provider: 'bar',
        })
      ).toEqual(
        new Provider(
          new ProviderConfiguration('bar', mockSecurityValues, mockParameters)
        )
      );
    });

    it('should return Provider instance with custom values', async () => {
      expect(
        resolveProvider({
          superJson: mockSuperJson(),
          security: mockSecurityValues,
          parameters: mockParameters,
          provider: 'bar',
        })
      ).toEqual(
        new Provider(
          new ProviderConfiguration('bar', mockSecurityValues, mockParameters)
        )
      );
    });

    it('should return Provider instance with overriden values', async () => {
      expect(
        resolveProvider({
          superJson: mockSuperJson(),
          provider: new Provider(new ProviderConfiguration('bar', [], {})),
          profileId: 'foo',
          security: mockSecurityValues,
          parameters: mockParameters,
        })
      ).toEqual(
        new Provider(
          new ProviderConfiguration('bar', mockSecurityValues, mockParameters)
        )
      );
    });

    it('should return Provider instance and get provider for profile', async () => {
      expect(
        resolveProvider({
          superJson: mockSuperJson(),
          profileId: 'foo',
        })
      ).toEqual(new Provider(new ProviderConfiguration('bar', [])));
    });

    it('should return Provider instance and get provider for profile with values from super.json', async () => {
      expect(
        resolveProvider({
          superJson: mockSuperJson(true),
          profileId: 'foo',
        })
      ).toEqual(
        new Provider(
          new ProviderConfiguration('bar', mockSecurityValues, mockParameters)
        )
      );
    });

    it('should return Provider instance and get provider for profile with custom values', async () => {
      expect(
        resolveProvider({
          superJson: mockSuperJson(),
          profileId: 'foo',
          security: mockSecurityValues,
          parameters: mockParameters,
        })
      ).toEqual(
        new Provider(
          new ProviderConfiguration('bar', mockSecurityValues, mockParameters)
        )
      );
    });

    it('should throw error when profile is not configured in super.json', async () => {
      expect(() =>
        resolveProvider({
          profileId: 'boo',
          superJson: normalizeSuperJsonDocument(
            {
              profiles: {
                boo: {
                  version: '1.2.3',
                },
              },
              providers: {},
            },
            new MockEnvironment()
          ),
        })
      ).toThrow(noConfiguredProviderError('boo'));
    });

    it('should throw error when profile is not found in super.json', async () => {
      expect(() =>
        resolveProvider({ profileId: 'test', superJson: mockSuperJson() })
      ).toThrow(profileNotFoundError('test'));
    });
  });

  describe('when super.json is undefined', () => {
    it('should return Provider instance', async () => {
      expect(
        resolveProvider({
          provider: 'bar',
        })
      ).toEqual(new Provider(new ProviderConfiguration('bar', [])));
    });

    it('should return Provider instance with custom values', async () => {
      expect(
        resolveProvider({
          security: mockSecurityValues,
          parameters: mockParameters,
          provider: 'bar',
        })
      ).toEqual(
        new Provider(
          new ProviderConfiguration('bar', mockSecurityValues, mockParameters)
        )
      );
    });

    it('should return Provider instance with overriden values', async () => {
      expect(
        resolveProvider({
          security: mockSecurityValues,
          parameters: mockParameters,
          provider: new Provider(new ProviderConfiguration('bar', [])),
        })
      ).toEqual(
        new Provider(
          new ProviderConfiguration('bar', mockSecurityValues, mockParameters)
        )
      );
    });

    it('should throw error when provider and super.json is undefined', async () => {
      expect(() => resolveProvider({ profileId: 'foo' })).toThrow(
        noConfiguredProviderError('foo')
      );
    });

    it('should throw error when provider, profile id and super.json is undefined', async () => {
      expect(() => resolveProvider({})).toThrow(unableToResolveProviderError());
    });
  });
});
