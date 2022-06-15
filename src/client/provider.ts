import { SuperfaceClientBase } from './client';

export class ProviderConfiguration {
  constructor(public readonly name: string) {}

  get cacheKey(): string {
    // TODO: Research a better way?
    return JSON.stringify({ provider: this.name });
  }
}

export class Provider {
  constructor(
    public readonly client: SuperfaceClientBase,
    public readonly configuration: ProviderConfiguration
  ) {}

  async configure(): Promise<Provider> {
    const newConfiguration = new ProviderConfiguration(this.configuration.name);

    return new Provider(this.client, newConfiguration);
  }
}
