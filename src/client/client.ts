import { BackoffKind, OnFail, SuperJson } from '../internal';
import { SDKExecutionError } from '../internal/errors';
import { NonPrimitive } from '../internal/interpreter/variables';
import { ExponentialBackoff } from '../lib/backoff';
import { exists } from '../lib/io';
import { HooksContext, registerHooks } from './failure/event-adapter';
import { CircuitBreakerPolicy, Router } from './failure/policies';
import { FailurePolicy } from './failure/policy';
import {
  Profile,
  ProfileConfiguration,
  TypedProfile,
  UsecaseType,
} from './profile';
import { BoundProfileProvider, ProfileProvider } from './profile-provider';
import { Provider, ProviderConfiguration } from './provider';

/**
 * Cache for loaded super.json files so that they aren't reparsed each time a new superface client is created.
 */
const SUPER_CACHE: { [path: string]: SuperJson } = {};

export abstract class SuperfaceClientBase {
  public readonly superJson: SuperJson;
  private boundCache: {
    [key: string]: BoundProfileProvider;
  } = {};

  constructor() {
    const superCacheKey = process.env.SUPERFACE_PATH ?? SuperJson.defaultPath();

    if (SUPER_CACHE[superCacheKey] === undefined) {
      SUPER_CACHE[superCacheKey] = SuperJson.loadSync(superCacheKey).unwrap();
    } else {
      //TODO: better way of cummunicating this to user.
      console.warn('Multiple SuperfaceClient bad');
    }

    this.superJson = SUPER_CACHE[superCacheKey];

    this.hookPolicies();
  }

  /** Returns a BoundProfileProvider that is cached according to `profileConfig` and `providerConfig` cache keys. */
  async cacheBoundProfileProvider(
    profileConfig: ProfileConfiguration,
    providerConfig: ProviderConfiguration
  ): Promise<BoundProfileProvider> {
    const cacheKey = profileConfig.cacheKey + providerConfig.cacheKey;

    const bound = this.boundCache[cacheKey];
    if (bound === undefined) {
      const profileProvider = new ProfileProvider(
        this.superJson,
        profileConfig,
        providerConfig
      );
      const boundProfileProvider = await profileProvider.bind();
      this.boundCache[cacheKey] = boundProfileProvider;
    }

    return this.boundCache[cacheKey];
  }

  /** Gets a provider from super.json based on `providerName`. */
  async getProvider(providerName: string): Promise<Provider> {
    const providerSettings = this.superJson.normalized.providers[providerName];

    return new Provider(
      this,
      new ProviderConfiguration(providerName, providerSettings.security)
    );
  }

  /** Returns a provider configuration for when no provider is passed to untyped `.perform`. */
  async getProviderForProfile(profileId: string): Promise<Provider> {
    const knownProfileProviders = Object.keys(
      this.superJson.normalized.profiles[profileId]?.providers ?? {}
    );

    if (knownProfileProviders.length > 0) {
      const name = knownProfileProviders[0];

      return this.getProvider(name);
    }

    throw new SDKExecutionError(
      `No configured provider found for profile: ${profileId}`,
      [
        `Profile "${profileId}" needs at least one configured provider for automatic provider selection`,
      ],
      [
        `Check that a provider is configured for a profile in super.json -> profiles["${profileId}"].providers`,
        `Providers can be configured using the superface cli tool: \`superface configure --help\` for more info`,
      ]
    );
  }

  protected async getProfileConfiguration(
    profileId: string
  ): Promise<ProfileConfiguration> {
    const profileSettings = this.superJson.normalized.profiles[profileId];
    if (profileSettings === undefined) {
      throw new SDKExecutionError(
        `Profile not installed: ${profileId}`,
        [],
        [
          `Check that the profile is installed in super.json -> profiles["${profileId}"]`,
          `Profile can be installed using the superface cli tool: \`superface install ${profileId}\``,
        ]
      );
    }

    let version;
    if ('file' in profileSettings) {
      const filePath = this.superJson.resolvePath(profileSettings.file);
      if (!(await exists(filePath))) {
        throw new SDKExecutionError(
          `Profile file at path does not exist: ${profileSettings.file}`,
          [
            `Profile "${profileId}" specifies a file path "${profileSettings.file}" in super.json`,
            'but this path does not exist or is not accessible',
          ],
          [
            `Check that path in super.json -> profiles["${profileId}"].file exists and is accessible`,
            'Paths in super.json are either absolute or relative to the location of super.json',
          ]
        );
      }

      // TODO: read version from the ast?
      version = 'unknown';
    } else {
      version = profileSettings.version;
    }

    // TODO: load priority and add it to ProfileConfiguration?
    const priority = profileSettings.priority;
    if (!priority.every(p => this.superJson.normalized.providers[p])) {
      throw new SDKExecutionError(
        `Priority array of profile: ${profileId} contains unconfigured provider`,
        [
          `Profile "${profileId}" specifies a provider array [${priority.join(
            ', '
          )}] in super.json`,
          `but there are only these providers configured [${Object.keys(
            this.superJson.normalized.providers
          ).join(', ')}]`,
        ],
        [
          `Check that providers [${priority.join(
            ', '
          )}] are configured for profile "${profileId}"`,
          'Paths in super.json are either absolute or relative to the location of super.json',
        ]
      );
    }

    return new ProfileConfiguration(profileId, version);
  }

  private hookPolicies(): void {
    //create RetryHookContext and FailoverContext
    const hookContext: HooksContext = {};
    const usecaseProviders: Record<
      string,
      { providersOfUsecase: Record<string, FailurePolicy> }
    > = {};
    let policy: FailurePolicy;
    for (const [profile, profileSettings] of Object.entries(
      this.superJson.normalized.profiles
    )) {
      //Set failoverPolicy
      const priority = profileSettings.priority;
      if (!priority.every(p => this.superJson.normalized.providers[p])) {
        throw new SDKExecutionError(
          `Priority array of profile: ${profile} contains unconfigured provider`,
          [
            `Profile "${profile}" specifies a provider array [${priority.join(
              ', '
            )}] in super.json`,
            `but there are only these providers configured [${Object.keys(
              this.superJson.normalized.providers
            ).join(', ')}]`,
          ],
          [
            `Check that providers [${priority.join(
              ', '
            )}] are configured for profile "${profile}"`,
            'Paths in super.json are either absolute or relative to the location of super.json',
          ]
        );
      }
      //TODO: check duplicity of priority providers
      for (const provider of Object.keys(profileSettings.providers)) {
        for (const usecase of Object.keys(
          profileSettings.providers[provider].defaults
        )) {
          //Router
          const retryPolicy =
            profileSettings.providers[provider].defaults[usecase].retryPolicy;
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
            policy = new CircuitBreakerPolicy(
              {
                profileId: profile,
                usecaseName: usecase,
                // TODO: Somehow know safety
                usecaseSafety: 'unsafe',
              },
              //TODO are these defauts ok?
              retryPolicy.maxContiguousRetries ?? 5,
              60000,
              retryPolicy.requestTimeout ?? 10000,
              backoff
            );

            if (!usecaseProviders[`${profile}/${usecase}`]) {
              usecaseProviders[`${profile}/${usecase}`] = {
                providersOfUsecase: {},
              };
            }
            usecaseProviders[`${profile}/${usecase}`].providersOfUsecase[
              provider
            ] = policy;
          } else {
            throw 'Unreachable';
          }
        }
        //Build hook object
        for (const [key, providersContext] of Object.entries(
          usecaseProviders
        )) {
          hookContext[key] = {
            router: new Router(
              provider,
              providersContext.providersOfUsecase,
              priority
            ),
            queuedAction: undefined,
          };
        }
      }
    }

    registerHooks(hookContext);
  }
}

export class SuperfaceClient extends SuperfaceClientBase {
  /** Gets a profile from super.json based on `profileId` in format: `[scope/]name`. */
  async getProfile(profileId: string): Promise<Profile> {
    const profileConfiguration = await this.getProfileConfiguration(profileId);

    return new Profile(this, profileConfiguration);
  }
}

type ProfileUseCases<TInput extends NonPrimitive | undefined, TOutput> = {
  [profile: string]: UsecaseType<TInput, TOutput>;
};

export type TypedSuperfaceClient<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TProfiles extends ProfileUseCases<any, any>
  > = SuperfaceClientBase & {
    getProfile<TProfile extends keyof TProfiles>(
      profileId: TProfile
    ): Promise<TypedProfile<TProfiles[TProfile]>>;
  };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createTypedClient<TProfiles extends ProfileUseCases<any, any>>(
  profileDefinitions: TProfiles
): { new(): TypedSuperfaceClient<TProfiles> } {
  return class TypedSuperfaceClientClass
    extends SuperfaceClientBase
    implements TypedSuperfaceClient<TProfiles>
  {
    async getProfile<TProfile extends keyof TProfiles>(
      profileId: TProfile
    ): Promise<TypedProfile<TProfiles[TProfile]>> {
      const profileConfiguration = await this.getProfileConfiguration(
        profileId as string
      );

      return new TypedProfile(
        this,
        profileConfiguration,
        Object.keys(profileDefinitions[profileId])
      );
    }
  };
}

export const typeHelper = <TInput, TOutput>(): [TInput, TOutput] => {
  return [undefined as unknown, undefined as unknown] as [TInput, TOutput];
};
