import { SecurityValues } from '@superfaceai/ast';

import { getProviderForProfile, SuperJson } from '../../schema-tools';
import { noConfiguredProviderError } from '../errors';
import { Provider, ProviderConfiguration } from './provider';

/**
 * Resolves ProviderConfiguration from parameters.
 * Fallbacks to SuperJson information if provider not specified
 */
export function resolveProviderConfiguration({
  provider,
  security,
  parameters,
  superJson,
  profileId,
}: {
  provider: string | Provider | undefined;
  security?: SecurityValues[];
  parameters?: Record<string, string>;
  superJson?: SuperJson;
  profileId?: string;
}): ProviderConfiguration {
  if (provider !== undefined) {
    if (typeof provider === 'string') {
      // Fallback to super json values if possible
      const providerSettings = superJson?.normalized.providers[provider];

      return new ProviderConfiguration(
        provider,
        security ?? providerSettings?.security ?? [],
        parameters ?? providerSettings?.parameters
      );
    }

    return provider.configuration;
  }

  if (superJson !== undefined && profileId !== undefined) {
    return getProviderForProfile(superJson, profileId).configuration;
  }
  if (profileId !== undefined) {
    throw noConfiguredProviderError(profileId);
  }

  // TODO: better error
  throw new Error(
    `Not enough info, provider: ${provider ?? 'missing'}, ' sj ${
      superJson ?? 'missing'
    }, ' profile id ${profileId ?? 'missing'}`
  );
}
