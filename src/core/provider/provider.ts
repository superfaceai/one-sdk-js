import type { NormalizedSuperJsonDocument, SecurityValues } from '@superfaceai/ast';

import type { IProvider } from '../../interfaces';
import { mergeSecurity } from '../../schema-tools';
import {
  noConfiguredProviderError,
  unconfiguredProviderError,
} from '../errors';

export function getProvider(
  superJson: NormalizedSuperJsonDocument,
  providerName: string
): Provider {
  const providerSettings = superJson.providers[providerName];

  if (providerSettings === undefined) {
    throw unconfiguredProviderError(providerName);
  }

  return new Provider(
    new ProviderConfiguration(providerName, providerSettings.security)
  );
}

export function getProviderForProfile(
  superJson: NormalizedSuperJsonDocument,
  profileId: string
): Provider {
  const priorityProviders = superJson.profiles[profileId]?.priority ?? [];
  if (priorityProviders.length > 0) {
    const name = priorityProviders[0];

    return getProvider(superJson, name);
  }

  const knownProfileProviders = Object.keys(
    superJson.profiles[profileId]?.providers ?? {}
  );
  if (knownProfileProviders.length > 0) {
    const name = knownProfileProviders[0];

    return getProvider(superJson, name);
  }

  throw noConfiguredProviderError(profileId);
}

export class ProviderConfiguration {
  // TODO: where should we store security and parameters when they are passed to getProvider? Maybe Provider instance?
  /** @deprecated only for use in testing library */
  public readonly security: SecurityValues[];
  public readonly parameters?: Record<string, string>;

  constructor(
    public readonly name: string,
    security: SecurityValues[],
    parameters?: Record<string, string>
  ) {
    this.security = security;
    // Sanitize parameters
    if (parameters === undefined || Object.keys(parameters).length === 0) {
      this.parameters = undefined;
    } else {
      this.parameters = parameters;
    }
  }

  public get cacheKey(): string {
    // TODO: Research a better way?
    return JSON.stringify({ provider: this.name });
  }
}

export class Provider implements IProvider {
  constructor(public readonly configuration: ProviderConfiguration) {}

  /** @deprecated */
  public async configure(configuration?: {
    security?: SecurityValues[];
  }): Promise<Provider> {
    const newConfiguration = new ProviderConfiguration(
      this.configuration.name,
      mergeSecurity(this.configuration.security, configuration?.security ?? [])
    );

    return new Provider(newConfiguration);
  }
}
