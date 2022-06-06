import { ProfileDocumentNode, SuperJsonDocument } from '@superfaceai/ast';
import { promises as fsp } from 'fs';
import { join as joinPath } from 'path';

import { Config } from '../config';
import { Parser, SuperJson } from '../internal';
import {
  noConfiguredProviderError,
  profileFileNotFoundError,
  unconfiguredProviderError,
  unconfiguredProviderInPriorityError,
} from '../internal/errors.helpers';
import { NonPrimitive } from '../internal/interpreter/variables';
import { Events, FailureContext, SuccessContext } from '../lib/events';
import { exists } from '../lib/io';
import { MetricReporter } from '../lib/reporter';
import {
  HooksContext,
  registerHooks as registerFailoverHooks,
} from './failure/event-adapter';
import {
  Profile,
  ProfileBase,
  ProfileConfiguration,
  TypedProfile,
  UsecaseType,
} from './profile';
import { BoundProfileProvider, ProfileProvider } from './profile-provider';
import { Provider, ProviderConfiguration } from './provider';
import { fetchProfileSource } from './registry';

/**
 * Cache for loaded super.json files so that they aren't reparsed each time a new superface client is created.
 */
let SUPER_CACHE: { [path: string]: SuperJson } = {};
export function invalidateSuperfaceClientCache(): void {
  SUPER_CACHE = {};
}

export abstract class SuperfaceClientBase extends Events {
  public readonly superJson: SuperJson;
  private readonly metricReporter: MetricReporter | undefined;
  private boundCache: {
    [key: string]: { profileProvider: BoundProfileProvider; expiresAt: number };
  } = {};

  public hookContext: HooksContext = {};

  constructor(options?: { superJson?: SuperJson | SuperJsonDocument }) {
    super();

    this.superJson = resolveSuperJson(options?.superJson);

    if (!Config.instance().disableReporting) {
      this.hookMetrics();
      this.metricReporter = new MetricReporter(this.superJson);
      this.metricReporter.reportEvent({
        eventType: 'SDKInit',
        occurredAt: new Date(),
      });
    }
    registerFailoverHooks(this.hookContext, this);
  }

  /**
   * @deprecated
   * This is not a part of the public API, DON'T USE THIS METHOD
   * Returns a BoundProfileProvider that is cached according to `profileConfig` and `providerConfig` cache keys.
   */
  async cacheBoundProfileProvider(
    profile: ProfileBase,
    providerConfig: ProviderConfiguration
  ): Promise<BoundProfileProvider> {
    const cacheKey = profile.configuration.cacheKey + providerConfig.cacheKey;

    const bound = this.boundCache[cacheKey];

    const now = Math.floor(Date.now() / 1000);
    //If we don't have anything in cache we must bind
    if (bound === undefined) {
      await this.rebind(profile, providerConfig);
      //If we do but timeout is expired we schedule rebind
    } else if (bound.expiresAt < now) {
      void Promise.resolve().then(() => this.rebind(profile, providerConfig));
    }

    return this.boundCache[cacheKey].profileProvider;
  }

  private async rebind(
    profile: ProfileBase,
    providerConfig: ProviderConfiguration
  ): Promise<void> {
    const cacheKey = profile.configuration.cacheKey + providerConfig.cacheKey;

    const now = Math.floor(Date.now() / 1000);

    const profileProvider = new ProfileProvider(
      this.superJson,
      profile.ast,
      providerConfig,
      this
    );

    const boundProfileProvider = await profileProvider.bind({
      security: providerConfig.security,
    });
    this.boundCache[cacheKey] = {
      profileProvider: boundProfileProvider,
      expiresAt: now + Config.instance().superfaceCacheTimeout,
    };
  }

  /** Gets a provider from super.json based on `providerName`. */
  async getProvider(providerName: string): Promise<Provider> {
    const providerSettings = this.superJson.normalized.providers[providerName];

    if (providerSettings === undefined) {
      throw unconfiguredProviderError(providerName);
    }

    return new Provider(
      this,
      new ProviderConfiguration(providerName, providerSettings.security)
    );
  }

  /** Returns a provider configuration for when no provider is passed to untyped `.perform`. */
  async getProviderForProfile(profileId: string): Promise<Provider> {
    const priorityProviders =
      this.superJson.normalized.profiles[profileId]?.priority || [];
    if (priorityProviders.length > 0) {
      const name = priorityProviders[0];

      return this.getProvider(name);
    }

    const knownProfileProviders = Object.keys(
      this.superJson.normalized.profiles[profileId]?.providers ?? {}
    );
    if (knownProfileProviders.length > 0) {
      const name = knownProfileProviders[0];

      return this.getProvider(name);
    }

    throw noConfiguredProviderError(profileId);
  }

  protected async resolveProfileAst(
    profileConfiguration: ProfileConfiguration
  ): Promise<ProfileDocumentNode> {
    const profileSettings =
      this.superJson.normalized.profiles[profileConfiguration.id];
    if (profileSettings !== undefined) {
      let filepath: string;
      if ('file' in profileSettings) {
        // assumed right next to source file
        filepath = this.superJson.resolvePath(profileSettings.file);
      } else {
        // assumed to be in grid folder
        filepath = this.superJson.resolvePath(
          joinPath(
            'grid',
            `${profileConfiguration.id}@${profileSettings.version}.supr`
          )
        );
      }

      let contents, fileNameWithExtension;
      const extensions = ['.ast.json', ''];
      for (const extension of extensions) {
        fileNameWithExtension = filepath + extension;
        try {
          contents = await fsp.readFile(fileNameWithExtension, {
            encoding: 'utf-8',
          });
          break;
        } catch (e) {
          void e;
        }
      }

      if (contents !== undefined) {
        return Parser.parseProfile(contents, filepath, {
          profileName: profileConfiguration.id,
          //TODO: use scope
          scope: '',
        });
      }
    }
    //Fallback to remote
    const profileSource = await fetchProfileSource(
      `${profileConfiguration.id}@${profileConfiguration.version}`
    );
    
return Parser.parseProfile(profileSource, profileConfiguration.id, {
      profileName: profileConfiguration.id,
      //TODO: use scope
      scope: '',
    });
  }

  protected async getProfileConfiguration(
    profileId: string,
    version?: string
  ): Promise<ProfileConfiguration> {
    const profileSettings = this.superJson.normalized.profiles[profileId];
    if (profileSettings === undefined) {
      console.log('here we just pass');
      // throw profileNotInstalledError(profileId);

      return new ProfileConfiguration(profileId, version ?? 'unknown');
    }

    let versionFromConfig;
    if ('file' in profileSettings) {
      const filePath = this.superJson.resolvePath(profileSettings.file);
      if (!(await exists(filePath))) {
        throw profileFileNotFoundError(profileSettings.file, profileId);
      }

      // TODO: read version from the ast?
      versionFromConfig = 'unknown';
    } else {
      versionFromConfig = profileSettings.version;
    }

    // TODO: load priority and add it to ProfileConfiguration?
    const priority = profileSettings.priority;
    if (!priority.every(p => this.superJson.normalized.providers[p])) {
      throw unconfiguredProviderInPriorityError(
        profileId,
        priority,
        Object.keys(this.superJson.normalized.providers)
      );
    }

    return new ProfileConfiguration(profileId, versionFromConfig);
  }

  private hookMetrics(): void {
    process.on('beforeExit', () => this.metricReporter?.flush());
    process.on('uncaughtExceptionMonitor', () => {
      console.warn(
        'Warning: you do not handle all exceptions. This can prevent failure report to be sent.'
      );
    });
    this.on('success', { priority: 0 }, (context: SuccessContext) => {
      this.metricReporter?.reportEvent({
        eventType: 'PerformMetrics',
        profile: context.profile,
        success: true,
        provider: context.provider,
        occurredAt: context.time,
      });

      return { kind: 'continue' };
    });
    this.on('failure', { priority: 0 }, (context: FailureContext) => {
      this.metricReporter?.reportEvent({
        eventType: 'PerformMetrics',
        profile: context.profile,
        success: false,
        provider: context.provider,
        occurredAt: context.time,
      });

      return { kind: 'continue' };
    });
    this.on('provider-switch', { priority: 1000 }, context => {
      this.metricReporter?.reportEvent({
        eventType: 'ProviderChange',
        profile: context.profile,
        from: context.provider,
        to: context.toProvider,
        occurredAt: context.time,
        reasons: [{ reason: context.reason, occurredAt: context.time }],
      });
    });
  }
}

export class SuperfaceClient extends SuperfaceClientBase {
  /** Gets a profile from super.json based on `profileId` in format: `[scope/]name`. */
  async getProfile(profileId: string): Promise<Profile> {
    const profileConfiguration = await this.getProfileConfiguration(profileId); //, version);

    console.log('pc', profileConfiguration);

    const ast = await this.resolveProfileAst(profileConfiguration);

    console.log('ast', ast);

    return new Profile(this, profileConfiguration, ast);
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
): { new (): TypedSuperfaceClient<TProfiles> } {
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
      const ast = await this.resolveProfileAst(profileConfiguration);

      return new TypedProfile(
        this,
        profileConfiguration,
        ast,
        Object.keys(profileDefinitions[profileId])
      );
    }
  };
}

export const typeHelper = <TInput, TOutput>(): [TInput, TOutput] => {
  return [undefined as unknown, undefined as unknown] as [TInput, TOutput];
};

const resolveSuperJson = (
  superJson?: SuperJson | SuperJsonDocument
): SuperJson => {
  if (!superJson) {
    const cacheKey = Config.instance().superfacePath;

    if (SUPER_CACHE[cacheKey] === undefined) {
      SUPER_CACHE[cacheKey] = SuperJson.loadSync(cacheKey).unwrap();
    }

    return SUPER_CACHE[cacheKey];
  }
  if (superJson instanceof SuperJson) {
    return superJson;
  }

  return new SuperJson(superJson);
};
