import { SuperJsonDocument } from '@superfaceai/ast';

import {
  AuthCache,
  Config,
  Events,
  hookMetrics,
  IBoundProfileProvider,
  IConfig,
  ICrypto,
  IEnvironment,
  IFetch,
  ILogger,
  Interceptable,
  InternalClient,
  ISuperfaceClient,
  ITimers,
  loadConfigFromEnv,
  MetricReporter,
  Profile,
  Provider,
  registerHooks as registerFailoverHooks,
} from '../../core';
import { SuperCache } from '../../lib';
import {
  getProvider,
  getProviderForProfile,
  SuperJson,
} from '../../schema-tools';
import { NodeCrypto } from '../crypto';
import { NodeEnvironment } from '../environment';
import { NodeFetch } from '../fetch';
import { NodeFileSystem } from '../filesystem';
import { NodeLogger } from '../logger';
import { NodeTimers } from '../timers';

const resolveSuperJson = (
  path: string,
  environment: IEnvironment,
  crypto: ICrypto,
  superJson?: SuperJson | SuperJsonDocument,
  logger?: ILogger
): SuperJson => {
  if (superJson === undefined) {
    return SuperJson.loadSync(
      path,
      NodeFileSystem,
      environment,
      crypto,
      logger
    ).unwrap();
  }

  if (superJson instanceof SuperJson) {
    return superJson;
  }

  return new SuperJson(superJson);
};

const setupMetricReporter = (
  superJson: SuperJson,
  config: IConfig,
  timers: ITimers,
  events: Events,
  logger?: ILogger
) => {
  const metricReporter = new MetricReporter(
    superJson,
    config,
    timers,
    new NodeFetch(timers),
    logger
  );
  hookMetrics(events, metricReporter);
  metricReporter.reportEvent({
    eventType: 'SDKInit',
    occurredAt: new Date(timers.now()),
  });
  process.on('beforeExit', () => metricReporter.flush());
  process.on('uncaughtExceptionMonitor', () => {
    console.warn(
      'Warning: you do not handle all exceptions. This can prevent failure report to be sent.'
    );
  });
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
  protected readonly timers: ITimers;
  protected readonly crypto: ICrypto;
  protected readonly fetchInstance: IFetch & Interceptable & AuthCache;
  protected readonly logger?: ILogger;

  constructor(options?: { superJson?: SuperJson | SuperJsonDocument }) {
    const environment = new NodeEnvironment();
    this.crypto = new NodeCrypto();
    this.timers = new NodeTimers();
    this.logger = new NodeLogger();
    this.events = new Events(this.timers, this.logger);
    this.fetchInstance = new NodeFetch(this.timers);
    this.config = loadConfigFromEnv(environment, NodeFileSystem, this.logger);

    this.boundProfileProviderCache = new SuperCache<{
      provider: IBoundProfileProvider;
      expiresAt: number;
    }>();
    this.superJson = resolveSuperJson(
      this.config.superfacePath,
      environment,
      this.crypto,
      options?.superJson,
      this.logger
    );

    if (!this.config.disableReporting) {
      setupMetricReporter(
        this.superJson,
        this.config,
        this.timers,
        this.events,
        this.logger
      );
    }

    registerFailoverHooks(this.events, this.timers, this.logger);

    this.internal = new InternalClient(
      this.events,
      this.superJson,
      this.config,
      this.timers,
      NodeFileSystem,
      this.boundProfileProviderCache,
      this.crypto,
      this.fetchInstance,
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
