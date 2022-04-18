import { Config } from '../config';
import { SuperJson } from '../internal';
import {
  getProvider,
  getProviderForProfile,
} from '../internal/superjson/utils';
import { Events } from '../lib/events';
import { NodeFileSystem } from '../lib/io/filesystem.node';
import { hookMetrics, MetricReporter } from '../lib/reporter';
import { SuperCache } from './cache';
import { InternalClient } from './client.internal';
import { registerHooks as registerFailoverHooks } from './failure/event-adapter';
import { Profile } from './profile';
import { IBoundProfileProvider } from './profile-provider';
import { Provider } from './provider';

export interface ISuperfaceClient {
  getProfile(profileId: string): Promise<Profile>;
  getProvider(providerName: string): Promise<Provider>;
  getProviderForProfile(profileId: string): Promise<Provider>;
  on(...args: Parameters<Events['on']>): void;
}

export abstract class SuperfaceClientBase {
  public readonly superJson: SuperJson;
  protected readonly events: Events;
  protected readonly internal: InternalClient;

  constructor() {
    this.events = new Events();
    const config = Config.loadFromEnv();
    const superCacheKey = config.superfacePath;

    const boundProfileProviderCache = new SuperCache<{
      provider: IBoundProfileProvider;
      expiresAt: number;
    }>();
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
      NodeFileSystem,
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
