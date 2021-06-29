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
  Events,
  Interceptable,
  InterceptableMetadata,
} from '../lib/events';
import { HooksContext, registerHooks } from './failure/event-adapter';
import {
  AbortPolicy,
  CircuitBreakerPolicy,
  FailurePolicyRouter,
} from './failure/policies';
import { FailurePolicy } from './failure/policy';
import { ProfileBase } from './profile';
import { BoundProfileProvider } from './profile-provider';
import { Provider, ProviderConfiguration } from './provider';

export type PerformOptions = {
  provider?: Provider | string;
};

// TODO
export type PerformError = ProfileParameterError | MapInterpreterError;

class UseCaseBase implements Interceptable {
  public metadata: InterceptableMetadata;
  public events: Events;

  private hookContext: HooksContext = {};

  constructor(
    public readonly profile: ProfileBase,
    public readonly name: string
  ) {
    this.metadata = {
      usecase: name,
      profile: this.profile.configuration.id,
    };
    this.events = this.profile.client;

    this.hookPolicies();
  }

  protected async bind(
    options?: PerformOptions
  ): Promise<BoundProfileProvider> {
    let providerConfig: ProviderConfiguration;

    if (typeof options?.provider === 'string') {
      const provider = await this.profile.client.getProviderForProfile(
        this.profile.configuration.id,
        options.provider
      );
      providerConfig = provider.configuration;
    } else if (options?.provider?.configuration !== undefined) {
      providerConfig = options.provider.configuration;
    } else {
      const provider = await this.profile.client.getProviderForProfile(
        this.profile.configuration.id
      );
      providerConfig = provider.configuration;
    }

    this.metadata.provider = providerConfig.name;
    this.hookContext[
      `${this.profile.configuration.id}/${this.name}`
    ].router.setCurrentProvider(providerConfig.name);

    //In this instance we can set metadata for events
    const boundProfileProvider =
      await this.profile.client.cacheBoundProfileProvider(
        this.profile.configuration,
        providerConfig
      );

    this.metadata.provider = providerConfig.name;

    return boundProfileProvider;
  }

  @eventInterceptor({
    eventName: 'perform',
  })
  protected async performUsecase<
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

  private hookPolicies(): void {
    //Prepare hook context
    const profileId = this.profile.configuration.id;
    const providersOfUsecase: Record<string, FailurePolicy> = {};
    const profileSettings =
      this.profile.client.superJson.normalized.profiles[profileId];
    for (const [provider, providerSettings] of Object.entries(
      profileSettings.providers
    )) {
      const retryPolicy = providerSettings.defaults[this.name]?.retryPolicy;
      if (retryPolicy === undefined || retryPolicy.kind === OnFail.NONE) {
        //TODO: do we use abort policy here?
        const policy = new AbortPolicy({
          profileId,
          usecaseName: this.name,
          usecaseSafety: 'unsafe',
        });
        providersOfUsecase[provider] = policy;
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
            usecaseName: this.name,
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

    this.hookContext = {
      [`${profileId}/${this.name}`]: {
        router: new FailurePolicyRouter(
          //here we need providers of usecase
          providersOfUsecase,
          profileSettings.priority
        ),
        queuedAction: undefined,
      },
    };
    registerHooks(this.hookContext, this.profile.client);
  }
}

export class UseCase extends UseCaseBase {
  constructor(
    public override readonly profile: ProfileBase,
    public override readonly name: string
  ) {
    super(profile, name);
  }

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
    return this.performUsecase(input, options);
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
    return this.performUsecase(input, options);
  }
}
