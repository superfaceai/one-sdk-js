import { SecurityValues } from '@superfaceai/ast';

import { SuperJson } from '../../schema-tools';
import {
  noConfiguredProviderError,
  profileNotFoundError,
  unableToResolveProviderError,
} from '../errors';
import { Provider, ProviderConfiguration } from './provider';

/**
 * Resolves ProviderConfiguration from parameters.
 * Fallbacks to SuperJson information if provider not specified
 */
export function resolveProvider({
  provider,
  security,
  parameters,
  superJson,
  profileId,
}: {
  security?: SecurityValues[];
  parameters?: Record<string, string>;
  superJson?: SuperJson;
  provider?: string | Provider;
  profileId?: string;
}): Provider {
  if (provider !== undefined) {
    return createProvider({
      provider,
      security,
      superJson,
      parameters,
    });
  }

  if (profileId !== undefined) {
    if (superJson !== undefined) {
      const profileSettings = superJson.normalized.profiles[profileId];

      if (profileSettings === undefined) {
        throw profileNotFoundError(profileId);
      }

      const priorityProviders = profileSettings.priority;

      if (priorityProviders.length > 0) {
        return createProvider({
          provider: priorityProviders[0],
          security,
          superJson,
          parameters,
        });
      }
    }

    throw noConfiguredProviderError(profileId);
  }
  // This should be unreachable in common use
  throw unableToResolveProviderError();
}

function createProvider({
  provider,
  security,
  parameters,
  superJson,
}: {
  security?: SecurityValues[];
  parameters?: Record<string, string>;
  superJson?: SuperJson;
  provider: string | Provider;
}): Provider {
  if (typeof provider === 'string') {
    // Fallback to super json values if possible
    const providerSettings = superJson?.normalized.providers[provider];

    return new Provider(
      new ProviderConfiguration(
        provider,
        security ?? providerSettings?.security ?? [],
        parameters ?? providerSettings?.parameters
      )
    );
  }

  // Pass possibly new security and parameters
  return new Provider(
    new ProviderConfiguration(
      provider.configuration.name,
      security ?? provider.configuration.security ?? [],
      parameters ?? provider.configuration.parameters
    )
  );
}
