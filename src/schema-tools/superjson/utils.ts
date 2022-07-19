import { SecurityValues } from '@superfaceai/ast';

import {
  noConfiguredProviderError,
  Provider,
  ProviderConfiguration,
  unconfiguredProviderError,
} from '../../core';
import { SuperJson } from './superjson';

export function getProvider(
  superJson: SuperJson,
  providerName: string,
  security?: SecurityValues[],
  parameters?: Record<string, string>
): Provider {
  const providerSettings = superJson.normalized.providers[providerName];

  if (providerSettings === undefined) {
    throw unconfiguredProviderError(providerName);
  }

  return new Provider(
    new ProviderConfiguration(
      providerName,
      security ?? providerSettings.security,
      parameters ?? providerSettings.parameters
    )
  );
}

export function getProviderForProfile(
  superJson: SuperJson,
  profileId: string
): Provider {
  const priorityProviders =
    superJson.normalized.profiles[profileId]?.priority ?? [];
  if (priorityProviders.length > 0) {
    const name = priorityProviders[0];

    return getProvider(superJson, name);
  }

  const knownProfileProviders = Object.keys(
    superJson.normalized.profiles[profileId]?.providers ?? {}
  );
  if (knownProfileProviders.length > 0) {
    const name = knownProfileProviders[0];

    return getProvider(superJson, name);
  }

  throw noConfiguredProviderError(profileId);
}
