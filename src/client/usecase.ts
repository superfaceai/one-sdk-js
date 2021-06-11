import { MapInterpreterError, ProfileParameterError } from '../internal';
import { NonPrimitive, Variables } from '../internal/interpreter/variables';
import { Result } from '../lib';
import { eventInterceptor } from '../lib/events';
import { ProfileBase } from './profile';
import { BoundProfileProvider } from './profile-provider';
import { Provider } from './provider';

export type PerformOptions = {
  provider?: Provider;
};

// TODO
export type PerformError = ProfileParameterError | MapInterpreterError;

class UseCaseBase {
  constructor(
    public readonly profile: ProfileBase,
    public readonly name: string
  ) {
    Reflect.set(this, 'metadata', {
      usecase: name,
      profile: profile.configuration.id,
    });
  }

  protected async bind(
    options?: PerformOptions
  ): Promise<BoundProfileProvider> {
    let providerConfig = options?.provider?.configuration;
    if (providerConfig === undefined) {
      const provider = await this.profile.client.getProviderForProfile(
        this.profile.configuration.id
      );
      providerConfig = provider.configuration;
    }

    const boundProfileProvider =
      await this.profile.client.cacheBoundProfileProvider(
        this.profile.configuration,
        providerConfig
      );

    return boundProfileProvider;
  }
}

export class UseCase extends UseCaseBase {
  // public readonly metadata: { usecase: string; profile: string };

  // constructor(public override readonly profile: ProfileBase, public override  readonly name: string) {
  //   super(profile, name);
  //   this.metadata = {
  //     usecase: name,
  //     profile: profile.configuration.id,
  //   };
  // }

  @eventInterceptor({
    eventName: 'perform',
  })
  async perform<
    TInput extends NonPrimitive | undefined = Record<
      string,
      Variables | undefined
    >,
    TOutput = unknown
  >(
    input?: TInput,
    options?: PerformOptions
  ): Promise<Result<TOutput, PerformError>> {
    const boundProfileProvider = await this.bind(options);

    // TOOD: rewrap the errors for public consumption?
    return boundProfileProvider.perform<TInput, TOutput>(this.name, input);
  }
}

export class TypedUseCase<
  TInput extends NonPrimitive | undefined,
  TOutput
> extends UseCaseBase {
  async perform(
    input: TInput,
    options?: PerformOptions
  ): Promise<Result<TOutput, PerformError>> {
    const boundProfileProvider = await this.bind(options);

    return boundProfileProvider.perform(this.name, input);
  }
}
