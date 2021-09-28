import { BackoffKind, OnFail } from '@superfaceai/ast';
import createDebug from 'debug';

import { MapInterpreterError, ProfileParameterError } from '../internal';
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
import {
  AbortPolicy,
  CircuitBreakerPolicy,
  FailurePolicyRouter,
} from './failure/policies';
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

    this.configureHookContext();
  }

  private async bind(options?: PerformOptions): Promise<void> {
    const hookRouter =
      this.profile.client.hookContext[
        `${this.profile.configuration.id}/${this.name}`
      ].router;

    let providerConfig: ProviderConfiguration;

    const chosenProvider = options?.provider ?? hookRouter.getCurrentProvider();
    if (chosenProvider === undefined) {
      const provider = await this.profile.client.getProviderForProfile(
        this.profile.configuration.id
      );
      providerConfig = provider.configuration;
    } else if (typeof chosenProvider === 'string') {
      const provider = await this.profile.client.getProvider(chosenProvider);
      providerConfig = provider.configuration;
    } else {
      providerConfig = chosenProvider.configuration;
    }

    this.metadata.provider = providerConfig.name;
    hookRouter.setCurrentProvider(providerConfig.name);

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

  @eventInterceptor({ eventName: 'bind-and-perform', placement: 'around' })
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

    debug('bound provider', this.boundProfileProvider);

    return this.performBoundUsecase(input);
  }

  private checkWarnFailoverMisconfiguration() {
    const profileId = this.profile.configuration.id;

    // Check providerFailover/priority array
    const profileEntry =
      this.profile.client.superJson.normalized.profiles[profileId];

    if (profileEntry.defaults[this.name] === undefined) {
      return;
    }

    const failoverEnabled =
      profileEntry.defaults[this.name].providerFailover === true;
    const priorityEmpty = profileEntry.priority.length === 0;

    // If priority array is not empty but failover is not enable, issue a warning
    if (!priorityEmpty && !failoverEnabled) {
      console.warn(
        `Super.json sets provider failover priority to: "${profileEntry.priority.join(
          ', '
        )}" but provider failover is not allowed for usecase "${
          this.name
        }".\nTo allow provider failover please set property "providerFailover" in "${profileId}.defaults[${
          this.name
        }]" to true`
      );
    }

    // If priority array is empty and failover is enabled, issue a warning
    if (priorityEmpty && failoverEnabled) {
      console.warn(
        `Super.json does not set provider failover priority but provider failover is allowed for usecase "${this.name}".\nTo allow provider failover please set property "priority" in "${profileId}.priority".\nSetting priority according to order of providers in "${profileId}.providers"`
      );
    }
  }

  private configureHookContext() {
    this.checkWarnFailoverMisconfiguration();

    const profileId = this.profile.configuration.id;
    const profileSettings =
      this.profile.client.superJson.normalized.profiles[profileId];

    const key = `${profileId}/${this.name}`;

    if (this.profile.client.hookContext[key] === undefined) {
      this.profile.client.hookContext[key] = {
        router: new FailurePolicyRouter(
          provider => this.instantiateFailurePolicy(provider),
          // Use priority only when provider failover is enabled
          profileSettings.defaults[this.name]?.providerFailover === true
            ? profileSettings.priority
            : []
        ),
        queuedAction: undefined,
      };
    }
  }

  protected toggleFailover(enabled: boolean) {
    this.profile.client.hookContext[
      `${this.profile.configuration.id}/${this.name}`
    ].router.setAllowFailover(enabled);
  }

  private instantiateFailurePolicy(provider: string): FailurePolicy {
    const profileId = this.profile.configuration.id;
    const usecaseInfo: UsecaseInfo = {
      profileId,
      usecaseName: this.name,
      // TODO: Somehow know safety
      usecaseSafety: 'unsafe',
    };

    const profileSettings =
      this.profile.client.superJson.normalized.profiles[profileId];
    const retryPolicyConfig = profileSettings.providers[provider]?.defaults[
      this.name
    ]?.retryPolicy ?? { kind: OnFail.NONE };

    let policy: FailurePolicy;
    if (retryPolicyConfig.kind === OnFail.CIRCUIT_BREAKER) {
      let backoff: ExponentialBackoff | undefined = undefined;
      if (
        retryPolicyConfig.backoff?.kind &&
        retryPolicyConfig.backoff?.kind === BackoffKind.EXPONENTIAL
      ) {
        backoff = new ExponentialBackoff(
          retryPolicyConfig.backoff.start ?? 2000,
          retryPolicyConfig.backoff.factor
        );
      }

      policy = new CircuitBreakerPolicy(
        usecaseInfo,
        //TODO are these defauts ok?
        retryPolicyConfig.maxContiguousRetries ?? 5,
        30_000,
        retryPolicyConfig.requestTimeout,
        backoff
      );
    } else if (retryPolicyConfig.kind === OnFail.NONE) {
      policy = new AbortPolicy(usecaseInfo);
    } else {
      throw new UnexpectedError('Unreachable point reached.');
    }

    return policy;
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
    // Disable failover when user specified provider
    // needs to happen here because bindAndPerform is subject to retry from event hooks
    // including provider failover
    this.toggleFailover(options?.provider === undefined);

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
    // Disable failover when user specified provider
    // needs to happen here because bindAndPerform is subject to retry from event hooks
    // including provider failover
    this.toggleFailover(options?.provider === undefined);

    return this.bindAndPerform(input, options);
  }
}
