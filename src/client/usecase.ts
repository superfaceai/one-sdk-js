import {
  BackoffKind,
  MapInterpreterError,
  OnFail,
  ProfileParameterError,
} from '../internal';
import { NonPrimitive, Variables } from '../internal/interpreter/variables';
import { Result } from '../lib';
import { ExponentialBackoff } from '../lib/backoff';
import {
  eventInterceptor,
  Interceptable,
  InterceptableMetadata,
} from '../lib/events';
import { HooksContext, registerHooks } from './failure/event-adapter';
import { CircuitBreakerPolicy, Router } from './failure/policies';
import { FailurePolicy } from './failure/policy';
import { ProfileBase } from './profile';
import { BoundProfileProvider } from './profile-provider';
import { Provider } from './provider';

export type PerformOptions = {
  provider?: Provider;
};

// TODO
export type PerformError = ProfileParameterError | MapInterpreterError;

class UseCaseBase implements Interceptable {
  public metadata: InterceptableMetadata;

  constructor(
    public readonly profile: ProfileBase,
    public readonly name: string
  ) {
    //Prepare hook context
    const profileId = this.profile.configuration.id;
    const providersOfUsecase: Record<string, FailurePolicy> = {};
    const profileSettings =
      this.profile.client.superJson.normalized.profiles[profileId];
    for (const [provider, providerSettings] of Object.entries(
      profileSettings.providers
    )) {
      //
      console.log(
        'provider',
        provider,
        'set',
        providerSettings,
        'def',
        providerSettings.defaults
      );
      const retryPolicy = providerSettings.defaults[name].retryPolicy;
      if (retryPolicy.kind === OnFail.NONE) {
        continue;
      } else if (retryPolicy.kind === OnFail.CIRCUIT_BREAKER) {
        let backoff: ExponentialBackoff | undefined = undefined;
        if (
          retryPolicy.backoff?.kind &&
          retryPolicy.backoff?.kind === BackoffKind.EXPONENTIAL
        ) {
          backoff = new ExponentialBackoff(
            retryPolicy.backoff.start ?? 2000,
            retryPolicy.backoff.factor
          );
        }
        const policy = new CircuitBreakerPolicy(
          {
            profileId,
            usecaseName: name,
            // TODO: Somehow know safety
            usecaseSafety: 'unsafe',
          },
          //TODO are these defauts ok?
          retryPolicy.maxContiguousRetries ?? 5,
          60000,
          retryPolicy.requestTimeout,
          backoff
        );
        providersOfUsecase[provider] = policy;
      } else {
        throw 'Unreachable';
      }
    }

    const hookContext: HooksContext = {
      [`${profileId}/${name}`]: {
        router: new Router(
          //here we need providers of usecase
          providersOfUsecase,
          profileSettings.priority
        ),
        queuedAction: undefined,
      },
    };
    console.log('hooks', hookContext);
    this.metadata = {
      usecase: name,
      profile: this.profile.configuration.id,
    };

    registerHooks(hookContext);
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

    this.metadata.provider = providerConfig.name;

    //In this instance we can set metadat for events
    const boundProfileProvider =
      await this.profile.client.cacheBoundProfileProvider(
        this.profile.configuration,
        providerConfig
      );

    return boundProfileProvider;
  }
}

export class UseCase extends UseCaseBase {
  constructor(
    public readonly profile: ProfileBase,
    public readonly name: string
  ) {
    super(profile, name);
  }

  @eventInterceptor({ eventName: 'perform', placement: 'around' })
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
    return await boundProfileProvider.perform<TInput, TOutput>(
      this.name,
      input
    );
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

    return await boundProfileProvider.perform(this.name, input);
  }
}
