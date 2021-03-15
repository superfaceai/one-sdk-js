import { AuthVariables } from '../../internal';
import { mergeVariables } from '../../internal/interpreter/variables';
import clone from '../../lib/clone';
import { SuperfaceClient } from './client';

export class ProviderConfiguration {
  constructor(
    public readonly name: string,
    public readonly auth: AuthVariables,
    public readonly serviceId?: string
  ) {}

  get cacheKey(): string {
    // TOOD: Research a better way?
    return JSON.stringify(this);
  }
}

export class Provider {
  constructor(
    public readonly client: SuperfaceClient,
    public readonly configuration: ProviderConfiguration
  ) {}

  async configure(configuration: {
    auth?: AuthVariables;
    serviceId?: string;
  }): Promise<Provider> {
    const newConfiguration = new ProviderConfiguration(
      this.configuration.name,
      mergeVariables(clone(this.configuration.auth), configuration.auth ?? {}),
      configuration.serviceId ?? this.configuration.serviceId
    );

    return new Provider(this.client, newConfiguration);
  }
}
