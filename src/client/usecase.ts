import createDebug from 'debug';

import {
  BackoffKind,
  MapInterpreterError,
  OnFail,
  ProfileParameterError,
} from '../internal';
import { UnexpectedError } from '../internal/errors';
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
import { CircuitBreakerPolicy, FailurePolicyRouter } from './failure/policies';
import { FailurePolicy, UsecaseInfo } from './failure/policy';
import { ProfileBase } from './profile';
import { BoundProfileProvider } from './profile-provider';
import { Provider, ProviderConfiguration } from './provider';

const debug = createDebug('superface:usecase');

export type PerformOptions = {
  provider?: Provider | string;
};

// TODO
export type PerformError = ProfileParameterError | MapInterpreterError;

class UseCaseBase implements Interceptable {
  public metadata: InterceptableMetadata;
  public events: Events;

  private hookContext: HooksContext = {};
  private boundProfileProvider: BoundProfileProvider | undefined;

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

  private async bind(options?: PerformOptions): Promise<void> {
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
    this.boundProfileProvider =
      await this.profile.client.cacheBoundProfileProvider(
        this.profile.configuration,
        providerConfig
      );
  }

  @eventInterceptor({ eventName: 'perform', placement: 'around' })
  private async performBoundUsecase<
    TInput extends NonPrimitive | undefined = Record<
      string,
      Variables | undefined
    >,
    TOutput = unknown
  >(input?: TInput): Promise<Result<TOutput, PerformError>> {
    if (this.boundProfileProvider === undefined) {
      throw new UnexpectedError(
        'Unreachable code reached: BoundProfileProvider is undefined.'
      );
    }

    // TODO: rewrap the errors for public consumption?
    return this.boundProfileProvider.perform<TInput, TOutput>(this.name, input);
  }

  @eventInterceptor({ eventName: 'bind', placement: 'around' })
  protected async bindAndPerform<
    TInput extends NonPrimitive | undefined = Record<
      string,
      Variables | undefined
    >,
    TOutput = unknown
  >(
    input?: TInput,
    options?: PerformOptions
  ): Promise<Result<TOutput, PerformError>> {
    await this.bind(options);

    debug('bound', this.boundProfileProvider);

    return this.performBoundUsecase(input);
  }

  private hookPolicies(): void {
    //Prepare hook context
    const profileId = this.profile.configuration.id;

    const usecaseInfo: UsecaseInfo = {
      profileId,
      usecaseName: this.name,
      // TODO: Somehow know safety
      usecaseSafety: 'unsafe',
    };

    const providersOfUsecase: Record<string, FailurePolicy> = {};
    const profileSettings =
      this.profile.client.superJson.normalized.profiles[profileId];
    for (const [provider, providerSettings] of Object.entries(
      profileSettings.providers
    )) {
      const retryPolicy = providerSettings.defaults[this.name]?.retryPolicy ?? {
        kind: OnFail.NONE,
      };
      if (retryPolicy.kind === OnFail.CIRCUIT_BREAKER) {
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
          usecaseInfo,
          //TODO are these defauts ok?
          retryPolicy.maxContiguousRetries ?? 5,
          30_000,
          retryPolicy.requestTimeout,
          backoff
        );
        providersOfUsecase[provider] = policy;
      }
    }

    this.hookContext = {
      [`${profileId}/${this.name}`]: {
        router: new FailurePolicyRouter(
          usecaseInfo,
          // here we need providers of usecase
          providersOfUsecase,
          //Use priority only when provider failover is true
          profileSettings.defaults[this.name]?.providerFailover
            ? profileSettings.priority
            : []
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
    return this.bindAndPerform(input, options);
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
    return this.bindAndPerform(input, options);
  }
}
