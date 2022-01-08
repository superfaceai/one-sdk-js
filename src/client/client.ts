import { Config } from '../config';
import { SuperJson } from '../internal';
import {
  noConfiguredProviderError,
  profileFileNotFoundError,
  profileNotInstalledError,
  unconfiguredProviderError,
  unconfiguredProviderInPriorityError,
} from '../internal/errors.helpers';
import { Events, FailureContext, SuccessContext } from '../lib/events';
import { exists } from '../lib/io';
import { MetricReporter } from '../lib/reporter';
import { SuperCache } from './cache';
import { registerHooks as registerFailoverHooks } from './failure/event-adapter';
import { Profile, ProfileConfiguration } from './profile';
import { BoundProfileProvider, ProfileProvider } from './profile-provider';
import { Provider, ProviderConfiguration } from './provider';

export interface ISuperfaceClient {
  getProfile(profileId: string): Promise<Profile>;
  getProvider(providerName: string): Promise<Provider>;
  getProviderForProfile(profileId: string): Promise<Provider>;
  on(...args: Parameters<Events['on']>): void;
}

export async function bindProfileProvider(
  profileConfig: ProfileConfiguration,
  providerConfig: ProviderConfiguration,
  superJson: SuperJson,
  config: Config,
  events: Events
): Promise<BoundProfileProvider> {
  const profileProvider = new ProfileProvider(
    superJson,
    profileConfig,
    providerConfig,
    config,
    events
  );
  const boundProfileProvider = await profileProvider.bind();

  return boundProfileProvider;
}

export class InternalClient {
  constructor(
    private readonly events: Events,
    private readonly superJson: SuperJson,
    private readonly config: Config,
    private readonly boundProfileProviderCache: SuperCache<BoundProfileProvider>
  ) {}

  async getProfile(profileId: string): Promise<Profile> {
    const profileConfiguration = await this.getProfileConfiguration(profileId);

    return new Profile(
      profileConfiguration,
      this.events,
      this.superJson,
      this.config,
      this.boundProfileProviderCache
    );
  }

  private async getProfileConfiguration(
    profileId: string
  ): Promise<ProfileConfiguration> {
    const profileSettings = this.superJson.normalized.profiles[profileId];
    if (profileSettings === undefined) {
      throw profileNotInstalledError(profileId);
    }

    let version;
    if ('file' in profileSettings) {
      const filePath = this.superJson.resolvePath(profileSettings.file);
      if (!(await exists(filePath))) {
        throw profileFileNotFoundError(profileSettings.file, profileId);
      }

      // TODO: read version from the ast?
      version = 'unknown';
    } else {
      version = profileSettings.version;
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

    return new ProfileConfiguration(profileId, version);
  }
}

export function getProvider(
  superJson: SuperJson,
  providerName: string
): Provider {
  const providerSettings = superJson.normalized.providers[providerName];

  if (providerSettings === undefined) {
    throw unconfiguredProviderError(providerName);
  }

  return new Provider(
    new ProviderConfiguration(providerName, providerSettings.security)
  );
}

export function getProviderForProfile(
  superJson: SuperJson,
  profileId: string
): Provider {
  const priorityProviders =
    superJson.normalized.profiles[profileId]?.priority || [];
  if (priorityProviders.length > 0) {
    const name = priorityProviders[0];

    return getProvider(superJson, name);
  }

  const knownProfileProviders = Object.keys(
    superJson.normalized.profiles[profileId]?.providers ?? {}
  );
  if (knownProfileProviders.length > 0) {
    const name = knownProfileProviders[0];

    return getProvider(superJson, name);
  }

  throw noConfiguredProviderError(profileId);
}

export function hookMetrics(
  events: Events,
  metricReporter: MetricReporter
): void {
  process.on('beforeExit', () => metricReporter?.flush());
  process.on('uncaughtExceptionMonitor', () => {
    console.warn(
      'Warning: you do not handle all exceptions. This can prevent failure report to be sent.'
    );
  });
  events.on('success', { priority: 0 }, (context: SuccessContext) => {
    metricReporter?.reportEvent({
      eventType: 'PerformMetrics',
      profile: context.profile,
      success: true,
      provider: context.provider,
      occurredAt: context.time,
    });

    return { kind: 'continue' };
  });
  events.on('failure', { priority: 0 }, (context: FailureContext) => {
    metricReporter?.reportEvent({
      eventType: 'PerformMetrics',
      profile: context.profile,
      success: false,
      provider: context.provider,
      occurredAt: context.time,
    });

    return { kind: 'continue' };
  });
  events.on('provider-switch', { priority: 1000 }, context => {
    metricReporter?.reportEvent({
      eventType: 'ProviderChange',
      profile: context.profile,
      from: context.provider,
      to: context.toProvider,
      occurredAt: context.time,
      reasons: [{ reason: context.reason, occurredAt: context.time }],
    });
  });
}

export abstract class SuperfaceClientBase {
  public readonly superJson: SuperJson;

  protected readonly events: Events;
  protected readonly internal: InternalClient;

  constructor() {
    this.events = new Events();
    const config = Config.loadFromEnv();
    const superCacheKey = config.superfacePath;

    const boundProfileProviderCache = new SuperCache<BoundProfileProvider>();
    this.superJson = SuperJson.loadSync(superCacheKey).unwrap();

    let metricReporter: MetricReporter | undefined;
    if (!config.disableReporting) {
      metricReporter = new MetricReporter(this.superJson, config);
      hookMetrics(this.events, metricReporter);
      metricReporter.reportEvent({
        eventType: 'SDKInit',
        occurredAt: new Date(),
      });
    }

    registerFailoverHooks(this.events);

    this.internal = new InternalClient(
      this.events,
      this.superJson,
      config,
      boundProfileProviderCache
    );
  }

  /** Gets a provider from super.json based on `providerName`. */
  async getProvider(providerName: string): Promise<Provider> {
    return getProvider(this.superJson, providerName);
  }

  /** Returns a provider configuration for when no provider is passed to untyped `.perform`. */
  async getProviderForProfile(profileId: string): Promise<Provider> {
    return getProviderForProfile(this.superJson, profileId);
  }

  public on(...args: Parameters<Events['on']>): void {
    this.events.on(...args);
  }
}

export class SuperfaceClient
  extends SuperfaceClientBase
  implements ISuperfaceClient
{
  /** Gets a profile from super.json based on `profileId` in format: `[scope/]name`. */
  async getProfile(profileId: string): Promise<Profile> {
    return this.internal.getProfile(profileId);
  }
}

// type ProfileUseCases<TInput extends NonPrimitive | undefined, TOutput> = {
//   [profile: string]: UsecaseType<TInput, TOutput>;
// };

// export type TypedSuperfaceClient<
//   // eslint-disable-next-line @typescript-eslint/no-explicit-any
//   TProfiles extends ProfileUseCases<any, any>
// > = SuperfaceClientBase & {
//   getProfile<TProfile extends keyof TProfiles>(
//     profileId: TProfile
//   ): Promise<TypedProfile<TProfiles[TProfile]>>;
// };

// // eslint-disable-next-line @typescript-eslint/no-explicit-any
// export function createTypedClient<TProfiles extends ProfileUseCases<any, any>>(
//   profileDefinitions: TProfiles
// ): { new (): TypedSuperfaceClient<TProfiles> } {
//   return class TypedSuperfaceClientClass
//     extends SuperfaceClientBase
//     implements TypedSuperfaceClient<TProfiles>
//   {
//     async getProfile<TProfile extends keyof TProfiles>(
//       profileId: TProfile
//     ): Promise<TypedProfile<TProfiles[TProfile]>> {
//       const profileConfiguration = await this.getProfileConfiguration(
//         profileId as string
//       );

//       return new TypedProfile(
//         this,
//         profileConfiguration,
//         Object.keys(profileDefinitions[profileId])
//       );
//     }
//   };
// }

// export const typeHelper = <TInput, TOutput>(): [TInput, TOutput] => {
//   return [undefined as unknown, undefined as unknown] as [TInput, TOutput];
// };
