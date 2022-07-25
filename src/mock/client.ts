import {
  MapDocumentNode,
  ProfileDocumentNode,
  ProviderJson,
} from '@superfaceai/ast';
import { ProfileId, ProfileVersion } from '@superfaceai/parser';

import {
  BoundProfileProvider,
  Config,
  Events,
  hookMetrics,
  IBoundProfileProvider,
  IConfig,
  ICrypto,
  IEnvironment,
  IFileSystem,
  ILogger,
  InternalClient,
  ISuperfaceClient,
  MetricReporter,
  Profile,
  ProfileConfiguration,
  Provider,
  ProviderConfiguration,
  registerHooks,
  SecurityConfiguration,
  ServiceSelector,
} from '../core';
import { SuperCache } from '../lib/cache';
import { NodeCrypto, NodeFetch, NodeFileSystem, NodeLogger } from '../node';
import { getProvider, getProviderForProfile, SuperJson } from '../schema-tools';
import { MockEnvironment } from './environment';
import { IPartialFileSystem, MockFileSystem } from './filesystem';
import { MockTimers } from './timers';

const mockProviderJson = (name: string): ProviderJson => ({
  name,
  defaultService: 'default',
  services: [
    {
      id: 'default',
      baseUrl: 'http://localhost',
    },
  ],
});

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
    public superJson?: SuperJson,
    parameters?: {
      configOverride?: Partial<IConfig>;
      fileSystemOverride?: IPartialFileSystem;
    }
  ) {
    // TODO: test logger?
    this.logger = new NodeLogger();
    // TODO: test crytpo?
    this.crypto = new NodeCrypto();
    this.environment = new MockEnvironment();
    this.timers = new MockTimers();

    this.config = new Config(NodeFileSystem, {
      disableReporting: true,
      ...parameters?.configOverride,
    });
    this.events = new Events(this.timers, this.logger);
    registerHooks(this.events, this.timers, this.logger);

    if (
      this.config.disableReporting === false &&
      this.superJson !== undefined
    ) {
      this.metricReporter = new MetricReporter(
        this.superJson,
        this.config,
        this.timers,
        new NodeFetch(this.timers),
        this.logger
      );
      hookMetrics(this.events, this.metricReporter);
    }

    this.cache = new SuperCache<{
      provider: IBoundProfileProvider;
      expiresAt: number;
    }>();

    const fileSystem: IFileSystem = MockFileSystem(
      parameters?.fileSystemOverride
    );

    this.internalClient = new InternalClient(
      this.events,
      superJson,
      this.config,
      this.timers,
      fileSystem,
      this.cache,
      this.crypto,
      new NodeFetch(this.timers),
      this.logger
    );
  }

  public addBoundProfileProvider(
    profile: ProfileDocumentNode,
    map: MapDocumentNode,
    provider: string | ProviderJson,
    baseUrl: string,
    securityValues: SecurityConfiguration[] = [],
    profileConfigOverride?: ProfileConfiguration
  ): void {
    const providerJson =
      typeof provider === 'string' ? mockProviderJson(provider) : provider;
    const providerConfiguration = new ProviderConfiguration(
      providerJson.name,
      []
    );
    const boundProfileProvider = new BoundProfileProvider(
      profile,
      map,
      providerJson,
      this.config,
      {
        services: ServiceSelector.withDefaultUrl(baseUrl),
        security: securityValues,
      },
      this.crypto,
      new NodeFetch(this.timers),
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

  public getProfile(
    profile: string | { id: string; version?: string }
  ): Promise<Profile> {
    return this.internalClient.getProfile(profile);
  }

  public async getProvider(providerName: string): Promise<Provider> {
    return getProvider(this.superJson, providerName);
  }

  public async getProviderForProfile(profileId: string): Promise<Provider> {
    return getProviderForProfile(this.superJson, profileId);
  }
}
