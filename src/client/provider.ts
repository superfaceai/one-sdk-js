import { SecurityValues } from '@superfaceai/ast';

import { mergeSecurity } from '../internal/superjson/mutate';
import { SuperfaceClientBase } from './client';

export class ProviderConfiguration {
  constructor(
    public readonly name: string,
    public readonly security: SecurityValues[],
    public readonly mapRevision?: string,
    public readonly mapVariant?: string
  ) {}

  get cacheKey(): string {
    // TODO: Research a better way?
    return JSON.stringify(this);
  }

  public static mergeWithOptions({
    configuration,
    name,
    security,
    mapRevision,
    mapVariant,
  }: {
    configuration: ProviderConfiguration;
    name?: string;
    security?: SecurityValues[];
    mapRevision?: string;
    mapVariant?: string;
  }): ProviderConfiguration {
    return new ProviderConfiguration(
      name ?? configuration.name,
      security ?? configuration.security,
      mapRevision ?? configuration.mapRevision,
      mapVariant ?? configuration.mapVariant
    );
  }
}

export class Provider {
  constructor(
    public readonly client: SuperfaceClientBase,
    public readonly configuration: ProviderConfiguration
  ) {}

  async configure(configuration: {
    security?: SecurityValues[];
  }): Promise<Provider> {
    const newConfiguration = new ProviderConfiguration(
      this.configuration.name,
      mergeSecurity(this.configuration.security, configuration.security ?? []),
      this.configuration.mapRevision,
      this.configuration.mapVariant
    );

    return new Provider(this.client, newConfiguration);
  }
}
