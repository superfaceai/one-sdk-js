import { AuthVariables } from "../../internal";
import { SuperfaceClient } from "./client";

export class ProviderConfiguration {
  constructor(
    public readonly name: string,
    public readonly auth: AuthVariables,
    public readonly serviceId?: string
  ) { }

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

  async configure(
    _: object
  ): Promise<Provider> {
    throw 'TODO'
  }
}