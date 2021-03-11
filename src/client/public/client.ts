import { SuperJson } from '../../internal';
import { exists } from '../../lib/io';
import { BoundProfileProvider, ProfileProvider } from '../query';
import { Profile, ProfileConfiguration } from './profile';
import { Provider, ProviderConfiguration } from './provider';

/**
 * Cache for loaded super.json files so that they aren't reparsed each time a new superface client is created.
 */
const SUPER_CACHE: { [path: string]: SuperJson } = {};

export class SuperfaceClient {
  public readonly superJson: SuperJson;
  private boundCache: {
    [key: string]: BoundProfileProvider;
  } = {};

  constructor(superJson?: SuperJson) {
    if (superJson === undefined) {
      const superCacheKey = SuperJson.defaultPath();

      if (SUPER_CACHE[superCacheKey] === undefined) {
        SUPER_CACHE[superCacheKey] = SuperJson.loadSync(superCacheKey).unwrap();
      }

      this.superJson = SUPER_CACHE[superCacheKey];
    } else {
      this.superJson = superJson;
    }
  }

  /** Gets a profile from super.json based on `profileId` in format: `[scope/]name`. */
  async getProfile(profileId: string): Promise<Profile> {
    const profileSettings = this.superJson.normalized.profiles[profileId];
    if (profileSettings === undefined) {
      throw new Error(
        `Profile "${profileId}" is not installed. Please install it by running \`superface install ${profileId}\`.`
      );
    }

    let version;
    if ('file' in profileSettings) {
      if (!(await exists(profileSettings.file))) {
        throw new Error(
          `File "${profileSettings.file}" specified in super.json does not exist.`
        );
      }

      // TODO: read version from the ast?
      version = 'unknown';
    } else {
      version = profileSettings.version;
    }

    return new Profile(this, new ProfileConfiguration(profileId, version));
  }

  /** Gets a provider from super.json based on `providerName`. */
  // eslint-disable-next-line @typescript-eslint/require-await
  async getProvider(providerName: string): Promise<Provider> {
    const providerSettings = this.superJson.normalized.providers[providerName];

    return new Provider(
      this,
      new ProviderConfiguration(providerName, providerSettings.auth)
    );
  }

  get profiles(): never {
    throw 'TODO';
  }

  get providers(): never {
    throw 'TODO';
  }

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
}
