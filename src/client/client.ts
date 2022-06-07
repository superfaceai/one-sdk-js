import { SuperJsonDocument } from '@superfaceai/ast';

import { Config } from '../config';
import { SuperJson } from '../internal';
import { NonPrimitive } from '../internal/interpreter/variables';
import {
  getProvider,
  getProviderForProfile,
} from '../internal/superjson/utils';
import { IEnvironment } from '../lib/environment';
import { NodeEnvironment } from '../lib/environment/environment.node';
import { Events } from '../lib/events';
import { NodeFileSystem } from '../lib/io/filesystem.node';
import { ILogger } from '../lib/logger/logger';
import { NodeLogger } from '../lib/logger/logger.node';
import { hookMetrics, MetricReporter } from '../lib/reporter';
import { SuperCache } from './cache';
import { InternalClient } from './client.internal';
import { registerHooks as registerFailoverHooks } from './failure/event-adapter';
import { Profile, TypedProfile, UsecaseType } from './profile';
import { IBoundProfileProvider } from './profile-provider';
import { Provider } from './provider';

export interface ISuperfaceClient {
  getProfile(profileId: string): Promise<Profile>;
  getProvider(providerName: string): Promise<Provider>;
  getProviderForProfile(profileId: string): Promise<Provider>;
  on(...args: Parameters<Events['on']>): void;
}

const resolveSuperJson = (
  path: string,
  environment: IEnvironment,
  superJson?: SuperJson | SuperJsonDocument,
  logger?: ILogger
): SuperJson => {
  if (superJson === undefined) {
    return SuperJson.loadSync(
      path,
      NodeFileSystem,
      environment,
      logger
    ).unwrap();
  }

  if (superJson instanceof SuperJson) {
    return superJson;
  }

  return new SuperJson(superJson);
};

export abstract class SuperfaceClientBase {
  public readonly superJson: SuperJson;
  protected readonly events: Events;
  protected readonly internal: InternalClient;
  protected readonly boundProfileProviderCache: SuperCache<{
    provider: IBoundProfileProvider;
    expiresAt: number;
  }>;

  protected readonly config: Config;
  protected readonly logger?: ILogger;

  constructor(options?: { superJson?: SuperJson | SuperJsonDocument }) {
    const environment = new NodeEnvironment();
    this.logger = new NodeLogger();
    this.events = new Events(this.logger);
    this.config = Config.loadFromEnv(environment, this.logger);

    this.boundProfileProviderCache = new SuperCache<{
      provider: IBoundProfileProvider;
      expiresAt: number;
    }>();
    this.superJson = resolveSuperJson(
      this.config.superfacePath,
      environment,
      options?.superJson,
      this.logger
    );

    let metricReporter: MetricReporter | undefined;
    if (!this.config.disableReporting) {
      metricReporter = new MetricReporter(
        this.superJson,
        this.config,
        this.logger
      );
      hookMetrics(this.events, metricReporter);
      metricReporter.reportEvent({
        eventType: 'SDKInit',
        occurredAt: new Date(),
      });
    }

    registerFailoverHooks(this.events, this.logger);

    this.internal = new InternalClient(
      this.events,
      this.superJson,
      this.config,
      NodeFileSystem,
      this.boundProfileProviderCache,
      this.logger
    );
  }

  /** Gets a provider from super.json based on `providerName`. */
  public async getProvider(providerName: string): Promise<Provider> {
    return getProvider(this.superJson, providerName);
  }

  /** Returns a provider configuration for when no provider is passed to untyped `.perform`. */
  public async getProviderForProfile(profileId: string): Promise<Provider> {
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
  public async getProfile(profileId: string): Promise<Profile> {
    return this.internal.getProfile(profileId);
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
    public async getProfile<TProfile extends keyof TProfiles>(
      profileId: TProfile
    ): Promise<TypedProfile<TProfiles[TProfile]>> {
      const profileConfiguration = await this.internal.getProfileConfiguration(
        profileId as string
      );

      return new TypedProfile(
        profileConfiguration,
        this.events,
        this.superJson,
        this.boundProfileProviderCache,
        this.config,
        NodeFileSystem,
        Object.keys(profileDefinitions[profileId]),
        this.logger
      );
    }
  };
}

export const typeHelper = <TInput, TOutput>(): [TInput, TOutput] => {
  return [undefined as unknown, undefined as unknown] as [TInput, TOutput];
};
