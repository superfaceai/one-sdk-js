import { NonPrimitive } from "../../internal/interpreter/variables";
import { Result } from "../../lib";
import { Provider, ProviderConfiguration } from "./provider";
import { BoundProfileProvider } from '../query/profile-provider';
import { Profile } from "./profile";

export type PerformOptions = {
  provider?: Provider
};

// TODO
export type PerformError = {

};

export class UseCase<
  TInput extends NonPrimitive = Record<string, any>,
  TOutput = unknown
> {
  constructor(
    public readonly profile: Profile,
    public readonly name: string
  ) {}

  async perform(
    inputs?: TInput,
    options?: PerformOptions
  ): Promise<Result<TOutput, PerformError>> {
    let providerConfig = options?.provider?.configuration;
    if (providerConfig === undefined) {
      providerConfig = {} as ProviderConfiguration; // TODO: obtain by choosing or configuring
    }

    const boundProfileProvider: BoundProfileProvider = await this.profile.client.cacheBoundProfileProvider(
      this.profile.configuration,
      providerConfig
    );

    // TOOD: rewrap the errors for public consumption?
    return boundProfileProvider.perform(
      this.name,
      inputs
    );
  }
}