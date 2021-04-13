import { SecurityValues, SuperJson } from '../../internal';
import { SuperfaceClientBase } from './client';

export class ProviderConfiguration {
  constructor(
    public readonly name: string,
    public readonly security: SecurityValues[],
    public readonly serviceId?: string
  ) {}

  get cacheKey(): string {
    // TODO: Research a better way?
    return JSON.stringify(this);
  }
}

export class Provider {
  constructor(
    public readonly client: SuperfaceClientBase,
    public readonly configuration: ProviderConfiguration
  ) {}

  async configure(configuration: {
    security?: SecurityValues[];
    serviceId?: string;
  }): Promise<Provider> {
    const newConfiguration = new ProviderConfiguration(
      this.configuration.name,
      SuperJson.mergeSecurity(
        this.configuration.security,
        configuration.security ?? []
      ),
      configuration.serviceId ?? this.configuration.serviceId
    );

    return new Provider(this.client, newConfiguration);
  }
}
