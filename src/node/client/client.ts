import { SuperJsonDocument } from '@superfaceai/ast';
import debug from 'debug';

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
  IFileSystem,
  ILogger,
  Interceptable,
  InternalClient,
  ISuperfaceClient,
  ITimers,
  loadConfigFromCode,
  loadConfigFromEnv,
  mergeConfigs,
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
): SuperJson | undefined => {
  if (superJson === undefined) {
    const superJsonResult = SuperJson.loadSync(
      path,
      NodeFileSystem,
      environment,
      crypto,
      logger
    );
    if (superJsonResult.isOk()) {
      return superJsonResult.value;
    }
    
return undefined;
  }

  if (superJson instanceof SuperJson) {
    return superJson;
  }

  return new SuperJson(superJson);
};

const resolveConfig = (
  config: Partial<IConfig> | undefined,
  environment: IEnvironment,
  fileSystem: IFileSystem,
  logger?: ILogger
): Config => {
  const envConfig = loadConfigFromEnv(environment, fileSystem, logger);
  if (config === undefined) {
    return envConfig;
  }

  return mergeConfigs(
    envConfig,
    loadConfigFromCode(config, fileSystem, logger),
    fileSystem,
    logger
  );
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
  public readonly superJson: SuperJson | undefined;
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

  constructor(
    options?: {
      superJson?: SuperJson | SuperJsonDocument;
      debug?: boolean;
      /**
       * Flag that can be used to disable caching to filesystem. `true` by default.
       */
      cache?: boolean;
    } & Partial<Omit<IConfig, 'cachePath'>>
  ) {
    if (options?.debug === true) {
      debug.enable('superface:*');
    }

    const environment = new NodeEnvironment();
    this.crypto = new NodeCrypto();
    this.timers = new NodeTimers();
    this.logger = new NodeLogger();
    this.events = new Events(this.timers, this.logger);
    this.fetchInstance = new NodeFetch(this.timers);
    this.config = resolveConfig(
      options,
      environment,
      NodeFileSystem,
      this.logger
    );

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

    // FIX: use without super.json
    if (!this.config.disableReporting && this.superJson !== undefined) {
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
  /** Gets a profile from super.json or remote registry based on `profile`. `profile` can be string in format: `[scope/]name@profileVersion` or object with `id` and optional `version` . */
  public async getProfile(
    profile: string | { id: string; version?: string }
  ): Promise<Profile> {
    return this.internal.getProfile(profile);
  }
}
