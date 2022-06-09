import { MapDocumentNode, ProfileDocumentNode } from '@superfaceai/ast';
import { ProfileId, ProfileVersion } from '@superfaceai/parser';

import {
  Profile,
  ProfileConfiguration,
  Provider,
  ProviderConfiguration,
} from '../client';
import { SuperCache } from '../client/cache';
import { ISuperfaceClient } from '../client/client';
import { InternalClient } from '../client/client.internal';
import { registerHooks } from '../client/failure/event-adapter';
import {
  BoundProfileProvider,
  IBoundProfileProvider,
} from '../client/profile-provider';
import { Config, IConfig } from '../config';
import { SecurityConfiguration } from '../internal/interpreter/http';
import { SuperJson } from '../internal/superjson';
import {
  getProvider,
  getProviderForProfile,
} from '../internal/superjson/utils';
import { ICrypto, NodeCrypto } from '../lib/crypto';
import { IEnvironment } from '../lib/environment';
import { Events } from '../lib/events';
import { IFileSystem } from '../lib/io';
import { ILogger } from '../lib/logger/logger';
import { NodeLogger } from '../lib/logger/logger.node';
import { hookMetrics, MetricReporter } from '../lib/reporter';
import { ServiceSelector } from '../lib/services';
import { MockEnvironment } from './environment';
import { MockFileSystem } from './filesystem';
import { MockTimers } from './timers';

export class MockClient implements ISuperfaceClient {
  public config: Config;
  public events: Events;
  public environment: IEnvironment;
  public cache: SuperCache<{
    provider: IBoundProfileProvider;
    expiresAt: number;
  }>;

  public internalClient: InternalClient;
  public metricReporter?: MetricReporter;
  public logger?: ILogger;
  public timers: MockTimers;
  public crypto: ICrypto;

  constructor(
    public superJson: SuperJson,
    parameters?: {
      configOverride?: Partial<IConfig>;
      fileSystemOverride?: Partial<IFileSystem>;
    }
  ) {
    // TODO: test logger?
    this.logger = new NodeLogger();
    // TODO: test crytpo?
    this.crypto = new NodeCrypto();
    this.environment = new MockEnvironment();
    this.timers = new MockTimers();

    this.config = new Config(this.environment, this.logger, {
      disableReporting: true,
      ...parameters?.configOverride,
    });
    this.events = new Events(this.timers, this.logger);
    registerHooks(this.events, this.timers, this.logger);

    if (this.config.disableReporting === false) {
      this.metricReporter = new MetricReporter(
        this.superJson,
        this.config,
        this.timers,
        this.logger
      );
      hookMetrics(this.events, this.metricReporter);
    }

    this.cache = new SuperCache<{
      provider: IBoundProfileProvider;
      expiresAt: number;
    }>();

    let fileSystem: IFileSystem = MockFileSystem();

    if (parameters?.fileSystemOverride !== undefined) {
      fileSystem = {
        ...fileSystem,
        ...parameters.fileSystemOverride,
      };
    }

    this.internalClient = new InternalClient(
      this.events,
      superJson,
      this.config,
      this.timers,
      fileSystem,
      this.cache,
      this.crypto,
      this.logger
    );
  }

  public addBoundProfileProvider(
    profile: ProfileDocumentNode,
    map: MapDocumentNode,
    provider: string | ProviderConfiguration,
    baseUrl: string,
    securityValues: SecurityConfiguration[] = [],
    profileConfigOverride?: ProfileConfiguration
  ): void {
    const providerConfiguration =
      typeof provider === 'string'
        ? new ProviderConfiguration(provider, [])
        : provider;
    const boundProfileProvider = new BoundProfileProvider(
      profile,
      map,
      providerConfiguration.name,
      this.config,
      this.timers,
      {
        services: ServiceSelector.withDefaultUrl(baseUrl),
        security: securityValues,
      },
      this.crypto,
      this.logger,
      this.events
    );

    const profileId = ProfileId.fromParameters({
      scope: profile.header.scope,
      name: profile.header.name,
      version: ProfileVersion.fromParameters(profile.header.version),
    });
    const profileConfiguration =
      profileConfigOverride ??
      new ProfileConfiguration(
        profileId.withoutVersion,
        profileId.version?.toString() ?? 'unknown'
      );

    this.cache.getCached(
      profileConfiguration.cacheKey + providerConfiguration.cacheKey,
      () => ({ provider: boundProfileProvider, expiresAt: Infinity })
    );
  }

  public on(...args: Parameters<Events['on']>): void {
    this.events.on(...args);
  }

  public getProfile(profileId: string): Promise<Profile> {
    return this.internalClient.getProfile(profileId);
  }

  public async getProvider(providerName: string): Promise<Provider> {
    return getProvider(this.superJson, providerName);
  }

  public async getProviderForProfile(profileId: string): Promise<Provider> {
    return getProviderForProfile(this.superJson, profileId);
  }
}
