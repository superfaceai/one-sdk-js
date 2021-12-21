import { SecurityValues } from '@superfaceai/ast';

import { mergeSecurity } from '../internal/superjson/mutate';

export class ProviderConfiguration {
  constructor(
    public readonly name: string,
    public readonly security: SecurityValues[]
  ) {}

  get cacheKey(): string {
    // TODO: Research a better way?
    return JSON.stringify(this);
  }
}

export class Provider {
  constructor(public readonly configuration: ProviderConfiguration) {}

  async configure(configuration: {
    security?: SecurityValues[];
  }): Promise<Provider> {
    const newConfiguration = new ProviderConfiguration(
      this.configuration.name,
      mergeSecurity(this.configuration.security, configuration.security ?? [])
    );

    return new Provider(newConfiguration);
  }
}
