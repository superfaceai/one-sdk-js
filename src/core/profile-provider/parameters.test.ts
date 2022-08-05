import type { ProviderJson } from '@superfaceai/ast';

import { resolveIntegrationParameters } from './parameters';

describe('resolveIntegrationParameters', () => {
  let mockProviderJson: ProviderJson;

  beforeEach(() => {
    mockProviderJson = {
      name: 'test',
      services: [{ id: 'test-service', baseUrl: 'service/base/url' }],
      securitySchemes: [],
      defaultService: 'test-service',
      parameters: [
        {
          name: 'first',
          description: 'first test value',
        },
        {
          name: 'second',
        },
        {
          name: 'third',
          default: 'third-default',
        },
        {
          name: 'fourth',
          default: 'fourth-default',
        },
      ],
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns undefined when parameters are undefined', () => {
    expect(resolveIntegrationParameters(mockProviderJson)).toBeUndefined();
  });

  it('prints warning when unknown parameter is used', () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    mockProviderJson.parameters = undefined;
    expect(
      resolveIntegrationParameters(mockProviderJson, { test: 'test' })
    ).toEqual({ test: 'test' });

    expect(consoleSpy).toHaveBeenCalledWith(
      'Warning: Super.json defines integration parameters but provider.json does not'
    );
  });

  it('returns resolved parameters', () => {
    expect(
      resolveIntegrationParameters(mockProviderJson, {
        first: 'plain value',
        second: '$TEST_SECOND', // unset env value without default
        third: '$TEST_THIRD', // unset env value with default
        // fourth is missing - should be resolved to its default
      })
    ).toEqual({
      first: 'plain value',
      second: '$TEST_SECOND',
      third: 'third-default',
      fourth: 'fourth-default',
    });
  });
});
