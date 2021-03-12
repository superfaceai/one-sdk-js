import { AuthVariables } from '../../internal';
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

  // eslint-disable-next-line @typescript-eslint/require-await
  async configure(_configuration: {
    auth?: AuthVariables;
    serviceId?: string;
  }): Promise<Provider> {
    throw 'TODO';
  }
}
