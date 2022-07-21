import {
  noConfiguredProviderError,
  Provider,
  ProviderConfiguration,
} from '../../core';
import { SuperJson } from './superjson';

export function getProvider(
  superJson: SuperJson | undefined,
  providerName: string
): Provider {
  const providerSettings = superJson?.normalized.providers[providerName];

  // if (providerSettings === undefined) {
  //   throw unconfiguredProviderError(providerName);
  // }

  return new Provider(
    new ProviderConfiguration(providerName, providerSettings?.security ?? [])
  );
}

export function getProviderForProfile(
  superJson: SuperJson | undefined,
  profileId: string
): Provider {
  const priorityProviders =
    superJson?.normalized.profiles[profileId]?.priority ?? [];
  if (priorityProviders.length > 0) {
    const name = priorityProviders[0];

    return getProvider(superJson, name);
  }

  const knownProfileProviders = Object.keys(
    superJson?.normalized.profiles[profileId]?.providers ?? {}
  );
  if (knownProfileProviders.length > 0) {
    const name = knownProfileProviders[0];

    return getProvider(superJson, name);
  }

  throw noConfiguredProviderError(profileId);
}
