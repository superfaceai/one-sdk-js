import { SecurityValues } from '@superfaceai/ast';

import { mergeSecurity } from '../../schema-tools';

export class ProviderConfiguration {
  constructor(
    public readonly name: string,
    /** @deprecated only for use in testing library */
    public readonly security: SecurityValues[],
    public readonly mapRevision?: string,
    public readonly mapVariant?: string,
  ) { }

  public get cacheKey(): string {
    // TODO: Research a better way?
    return JSON.stringify({ provider: this.name });
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
  constructor(public readonly configuration: ProviderConfiguration) { }

  /** @deprecated */
  public async configure(configuration?: {
    security?: SecurityValues[];
  }): Promise<Provider> {
    const newConfiguration = new ProviderConfiguration(
      this.configuration.name,
      mergeSecurity(this.configuration.security, configuration?.security ?? []),
      this.configuration.mapRevision,
      this.configuration.mapVariant
    );

    return new Provider(newConfiguration);
  }
}
