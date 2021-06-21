import { SuperJson } from '../internal';
import { SDKExecutionError } from '../internal/errors';
import { NonPrimitive } from '../internal/interpreter/variables';
import { exists } from '../lib/io';
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
    }

    this.superJson = SUPER_CACHE[superCacheKey];

    //TODO: use helpers from event-adapter.ts to create RetryHookContext
    //TODO: call  registerFetchRetryHooks()
  }

  get profiles(): never {
    throw 'TODO';
  }

  get providers(): never {
    throw 'TODO';
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
    // TODO: load policies here and add them to ProfileConfiguration

    const c = new ProfileConfiguration(profileId, version)
    console.log('get config ', c)
    return new ProfileConfiguration(profileId, version);
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
