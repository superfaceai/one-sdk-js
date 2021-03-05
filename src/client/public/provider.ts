import { AuthVariables } from "../../internal";
import { SuperfaceClient } from "./client";

export class ProviderConfiguration {
  constructor(
    public readonly file: string | undefined,
    public readonly authVariables: AuthVariables
  ) {}

  get hashkey(): string {
		throw 'TODO'
	}
}

export class Provider {
  constructor(
    private readonly client: SuperfaceClient,
    public readonly providerName: string,
    public readonly configuration: ProviderConfiguration
  ) {}

  async configure(configData: object): Promise<Provider> {
    throw 'TODO'
  }
}