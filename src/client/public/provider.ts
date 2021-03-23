import { AuthVariables } from '../../internal';
import { mergeVariables } from '../../internal/interpreter/variables';
import { SuperfaceClientBase } from './client';

export class ProviderConfiguration {
  constructor(
    public readonly name: string,
    public readonly auth: AuthVariables,
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
    auth?: AuthVariables;
    serviceId?: string;
  }): Promise<Provider> {
    const newConfiguration = new ProviderConfiguration(
      this.configuration.name,
      mergeVariables(this.configuration.auth, configuration.auth ?? {}),
      configuration.serviceId ?? this.configuration.serviceId
    );

    return new Provider(this.client, newConfiguration);
  }
}
