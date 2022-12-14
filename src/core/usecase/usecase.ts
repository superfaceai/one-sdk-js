import type {
  NormalizedSuperJsonDocument,
  SecurityValues,
} from '@superfaceai/ast';
import {
  BackoffKind,
  isApiKeySecurityValues,
  isBasicAuthSecurityValues,
  isBearerTokenSecurityValues,
  isDigestSecurityValues,
  OnFail,
} from '@superfaceai/ast';

import type {
  IConfig,
  ICrypto,
  IFileSystem,
  ILogger,
  ITimers,
  IUseCase,
  LogFunction,
} from '../../interfaces';
import { PerformOptions } from '../../interfaces';
import type { NonPrimitive, Result, SuperCache, Variables } from '../../lib';
import { UnexpectedError } from '../../lib';
import type {
  Events,
  FailurePolicy,
  Interceptable,
  InterceptableMetadata,
  UsecaseInfo,
} from '../events';
import {
  AbortPolicy,
  Backoff,
  CircuitBreakerPolicy,
  ConstantBackoff,
  eventInterceptor,
  ExponentialBackoff,
  FailurePolicyRouter,
  RetryPolicy,
} from '../events';
import type { AuthCache, IFetch, MapInterpreterError, ProfileParameterError } from '../interpreter';
import type { ProfileBase } from '../profile';
import type { IBoundProfileProvider } from '../profile-provider';
import {
  bindProfileProvider,
  ProfileProviderConfiguration,
} from '../profile-provider';
import type { Provider, ProviderConfiguration } from '../provider';
import { resolveProvider } from '../provider';

const DEBUG_NAMESPACE = 'usecase';

export function resolveSecurityValues(
  security?: SecurityValues[] | { [id: string]: Omit<SecurityValues, 'id'> },
  logFunction?: LogFunction
): SecurityValues[] | undefined {
  if (security === undefined) {
    return;
  }

  if (Array.isArray(security)) {
    return security;
  }

  const securityValues: SecurityValues[] = [];

  for (const [id, value] of Object.entries(security)) {
    const securityValue = { ...value, id };
    if (
      isBasicAuthSecurityValues(securityValue) ||
      isBearerTokenSecurityValues(securityValue) ||
      isApiKeySecurityValues(securityValue) ||
      isDigestSecurityValues(securityValue)
    ) {
      securityValues.push(securityValue);
    } else {
      logFunction?.('Security: %O is not supported', securityValue);
    }
  }

  return securityValues;
}

export type ProviderProvider = {
  getProvider: (provider: string) => Promise<Provider>;
  getProviderForProfile: (profileId: string) => Promise<Provider>;
};

export abstract class UseCaseBase implements Interceptable {
  public metadata: InterceptableMetadata;

  private boundProfileProvider: IBoundProfileProvider | undefined;
  private readonly log: LogFunction | undefined;

  constructor(
    public readonly profile: ProfileBase,
    public readonly name: string,
    public readonly events: Events,
    private readonly config: IConfig,
    private readonly superJson: NormalizedSuperJsonDocument | undefined,
    private readonly timers: ITimers,
    private readonly fileSystem: IFileSystem,
    private readonly crypto: ICrypto,
    private readonly boundProfileProviderCache: SuperCache<{
      provider: IBoundProfileProvider;
      expiresAt: number;
    }>,
    private readonly fetchInstance: IFetch & Interceptable & AuthCache,
    private readonly logger?: ILogger
  ) {
    this.metadata = {
      usecase: name,
      profile: this.profile.configuration.id,
    };
    this.log = logger?.log(DEBUG_NAMESPACE);

    this.configureHookContext();
  }

  private async bind(options?: {
    provider?: string | Provider | undefined;
    mapRevision?: string;
    mapVariant?: string;
  }): Promise<void> {
    const hookRouter =
      this.events.hookContext[`${this.profile.configuration.id}/${this.name}`]
        .router;

    const providerConfig = resolveProvider({
      provider: options?.provider ?? hookRouter.getCurrentProvider(),
      profileId: this.profile.configuration.id,
      superJson: this.superJson,
    }).configuration;

    hookRouter.setCurrentProvider(providerConfig.name);
    this.metadata.provider = providerConfig.name;

    this.boundProfileProvider = await this.rebind(
      this.profile.configuration.cacheKey + providerConfig.cacheKey,
      providerConfig,
      new ProfileProviderConfiguration(
        options?.mapRevision,
        options?.mapVariant
      )
    );
  }

  private async rebind(
    cacheKey: string,
    providerConfig: ProviderConfiguration,
    profileProviderConfig: ProfileProviderConfiguration
  ): Promise<IBoundProfileProvider> {
    const { provider, expiresAt } =
      await this.boundProfileProviderCache.getCached(cacheKey, () =>
        bindProfileProvider(
          this.profile.ast,
          profileProviderConfig,
          providerConfig,
          this.superJson,
          this.config,
          this.events,
          this.timers,
          this.fileSystem,
          this.crypto,
          this.fetchInstance,
          this.logger
        )
      );
    const now = Math.floor(this.timers.now() / 1000);
    if (expiresAt < now) {
      this.boundProfileProviderCache.invalidate(cacheKey);
      void this.rebind(cacheKey, providerConfig, profileProviderConfig);
    }

    return provider;
  }

  @eventInterceptor({ eventName: 'perform', placement: 'around' })
  private async performBoundUsecase<
    TInput extends NonPrimitive | undefined = Record<
      string,
      Variables | undefined
    >,
    TOutput = unknown
  >(
    input?: TInput,
    parameters?: Record<string, string>,
    security?: SecurityValues[]
  ): Promise<Result<TOutput, ProfileParameterError | MapInterpreterError | UnexpectedError>> {
    if (this.boundProfileProvider === undefined) {
      throw new UnexpectedError(
        'Unreachable code reached: BoundProfileProvider is undefined.'
      );
    }

    // TODO: rewrap the errors for public consumption?
    return this.boundProfileProvider.perform<TInput, TOutput>(
      this.name,
      input,
      parameters,
      security
    );
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
  ): Promise<Result<TOutput, ProfileParameterError | MapInterpreterError | UnexpectedError>> {
    await this.bind(options);

    this.log?.('Bound provider: %O', this.boundProfileProvider);

    return this.performBoundUsecase(
      input,
      options?.parameters,
      resolveSecurityValues(options?.security)
    );
  }

  private checkWarnFailoverMisconfiguration() {
    const profileId = this.profile.configuration.id;

    // Check providerFailover/priority array
    const profileEntry = this.superJson?.profiles[profileId];

    if (profileEntry?.defaults[this.name] === undefined) {
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
        )}" but provider failover is not allowed for usecase "${this.name
        }".\nTo allow provider failover please set property "providerFailover" in "${profileId}.defaults[${this.name
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
    const profileSettings = this.superJson?.profiles[profileId];

    const key = `${profileId}/${this.name}`;

    if (this.events.hookContext[key] === undefined) {
      this.events.hookContext[key] = {
        router: new FailurePolicyRouter(
          provider => this.instantiateFailurePolicy(provider),
          // Use priority only when provider failover is enabled
          profileSettings?.defaults[this.name]?.providerFailover === true
            ? profileSettings.priority
            : []
        ),
        queuedAction: undefined,
      };
    }
  }

  protected toggleFailover(enabled: boolean): void {
    this.events.hookContext[
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

    const profileSettings = this.superJson?.profiles[profileId];
    const retryPolicyConfig = profileSettings?.providers[provider]?.defaults[
      this.name
    ]?.retryPolicy ?? { kind: OnFail.NONE };

    let policy: FailurePolicy;
    if (retryPolicyConfig.kind === OnFail.CIRCUIT_BREAKER) {
      let backoff: ExponentialBackoff | undefined = new ExponentialBackoff(
        Backoff.DEFAULT_INITIAL,
        ExponentialBackoff.DEFAULT_BASE
      );
      if (
        retryPolicyConfig.backoff?.kind &&
        retryPolicyConfig.backoff?.kind === BackoffKind.EXPONENTIAL
      ) {
        backoff = new ExponentialBackoff(
          retryPolicyConfig.backoff.start ?? Backoff.DEFAULT_INITIAL,
          retryPolicyConfig.backoff.factor ?? ExponentialBackoff.DEFAULT_BASE
        );
      }

      policy = new CircuitBreakerPolicy(
        usecaseInfo,
        retryPolicyConfig.maxContiguousRetries ??
        RetryPolicy.DEFAULT_MAX_CONTIGUOUS_RETRIES,
        retryPolicyConfig.openTime ?? CircuitBreakerPolicy.DEFAULT_OPEN_TIME,
        retryPolicyConfig.requestTimeout ?? RetryPolicy.DEFAULT_REQUEST_TIMEOUT,
        backoff
      );
    } else if (retryPolicyConfig.kind === OnFail.SIMPLE) {
      policy = new RetryPolicy(
        usecaseInfo,
        retryPolicyConfig.maxContiguousRetries ??
        RetryPolicy.DEFAULT_MAX_CONTIGUOUS_RETRIES,
        retryPolicyConfig.requestTimeout ?? RetryPolicy.DEFAULT_REQUEST_TIMEOUT,
        new ConstantBackoff(0)
      );
    } else if (retryPolicyConfig.kind === OnFail.NONE) {
      policy = new AbortPolicy(usecaseInfo);
    } else {
      throw new UnexpectedError('Unreachable point reached.');
    }

    return policy;
  }
}

export class UseCase extends UseCaseBase implements IUseCase {
  public async perform<
    TInput extends NonPrimitive | undefined = Record<
      string,
      Variables | undefined
    >,
    TOutput = unknown
  >(
    input?: TInput,
    options?: PerformOptions
  ): Promise<Result<TOutput, ProfileParameterError | MapInterpreterError | UnexpectedError>> {
    // Disable failover when user specified provider
    // needs to happen here because bindAndPerform is subject to retry from event hooks
    // including provider failover
    this.toggleFailover(options?.provider === undefined);

    return this.bindAndPerform(input, options);
  }
}
