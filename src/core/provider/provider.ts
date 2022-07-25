import { SecurityValues } from '@superfaceai/ast';

import { mergeSecurity } from '../../schema-tools';

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
    if (parameters === undefined) {
      this.parameters = undefined;
    } else if (Object.keys(parameters).length === 0) {
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
