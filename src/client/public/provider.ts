import { AuthVariables } from "../../internal";
import { SuperfaceClient } from "./client";

export class ProviderConfiguration {
  constructor(
    public readonly name: string,
    public readonly auth: AuthVariables,
    public readonly serviceId?: string
  ) { }

  get cacheKey(): string {
    throw 'TODO'
  }

  // public static composeAuthVariables(): AuthVariables {
  //   const defaultAuth = castToNonPrimitive(this.providerConfiguration?.auth);

  //   let composed = this.bindConfig.auth ?? {};
  //   if (defaultAuth !== undefined) {
  //     // clone so we don't mutate super.json and resolve env for super.json values only
  //     const cloned = SuperJson.resolveEnvRecord(clone(defaultAuth));

  //     // merge with provided auth
  //     composed = mergeVariables(cloned, composed);
  //   }

  //   return composed;
  // }
}

export class Provider {
  constructor(
    private readonly client: SuperfaceClient,
    public readonly configuration: ProviderConfiguration
  ) { }

  async configure(configData: object): Promise<Provider> {
    throw 'TODO'
  }
}