import { SecurityValues } from '@superfaceai/ast';

import { mergeSecurity } from '~schema-tools';

export class ProviderConfiguration {
  constructor(
    public readonly name: string,
    /** @deprecated only for use in testing library */
    public readonly security: SecurityValues[]
  ) {}

  public get cacheKey(): string {
    // TODO: Research a better way?
    return JSON.stringify({ provider: this.name });
  }
}

export class Provider {
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
