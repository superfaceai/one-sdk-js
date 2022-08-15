import type {
  NormalizedSuperJsonDocument,
  SecurityValues,
  SuperJsonDocument,
} from '@superfaceai/ast';
import debug from 'debug';

import type {
  AuthCache,
  Config,
  IBoundProfileProvider,
  IConfig,
  ICrypto,
  IEnvironment,
  IFetch,
  IFileSystem,
  ILogger,
  Interceptable,
  ISuperfaceClient,
  ITimers,
  Profile,
  Provider,
} from '../../core';
import {
  Events,
  hookMetrics,
  InternalClient,
  loadConfigFromCode,
  loadConfigFromEnv,
  mergeConfigs,
  MetricReporter,
  registerHooks as registerFailoverHooks,
  resolveProvider,
  resolveSecurityValues,
  superJsonNotDefinedError,
} from '../../core';
import { SuperCache } from '../../lib';
import { loadSuperJsonSync } from '../../schema-tools';
import { normalizeSuperJsonDocument } from '../../schema-tools/superjson/normalize';
import { NodeCrypto } from '../crypto';
import { NodeEnvironment } from '../environment';
import { NodeFetch } from '../fetch';
import { NodeFileSystem } from '../filesystem';
import { NodeLogger } from '../logger';
import { NodeTimers } from '../timers';

const resolveSuperJson = (
  path: string,
  superJson?: SuperJsonDocument,
  logger?: ILogger
): SuperJsonDocument | undefined => {
  if (superJson === undefined) {
    const superJsonResult = loadSuperJsonSync(path, NodeFileSystem, logger);

    if (superJsonResult.isOk()) {
      return superJsonResult.value;
    }

    return undefined;
  }

  return superJson;
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
  config: IConfig,
  timers: ITimers,
  events: Events,
  crypto: ICrypto,
  superJson?: NormalizedSuperJsonDocument,
  logger?: ILogger
) => {
  const metricReporter = new MetricReporter(
    config,
    timers,
    new NodeFetch(timers),
    crypto,
    superJson,
    logger
  );
  hookMetrics(events, metricReporter);

  if (superJson) {
    metricReporter.reportEvent({
      eventType: 'SDKInit',
      occurredAt: new Date(timers.now()),
    });
  }

  process.on('beforeExit', () => metricReporter.flush());
  process.on('uncaughtExceptionMonitor', () => {
    console.warn(
      'Warning: you do not handle all exceptions. This can prevent failure report to be sent.'
    );
  });
};

export abstract class SuperfaceClientBase {
  public readonly superJson: NormalizedSuperJsonDocument | undefined;
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
      superJson?: SuperJsonDocument;
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
    const superJson = resolveSuperJson(
      this.config.superfacePath,
      options?.superJson,
      this.logger
    );
    this.superJson =
      superJson &&
      normalizeSuperJsonDocument(superJson, environment, this.logger);

    if (!this.config.disableReporting) {
      setupMetricReporter(
        this.config,
        this.timers,
        this.events,
        this.crypto,
        this.superJson,
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

  /** Gets a provider based on passed parameters or fallbacks to super.json information. */
  public async getProvider(
    providerName: string,
    options?: {
      parameters?: Record<string, string>;
      security?:
        | SecurityValues[]
        | { [id: string]: Omit<SecurityValues, 'id'> };
    }
  ): Promise<Provider> {
    return resolveProvider({
      superJson: this.superJson,
      security: resolveSecurityValues(
        options?.security,
        this.logger?.log('security-values-resolution')
      ),
      provider: providerName,
      parameters: options?.parameters,
    });
  }

  /** Returns a provider configuration for when no provider is passed to untyped `.perform`. */
  public async getProviderForProfile(profileId: string): Promise<Provider> {
    if (this.superJson === undefined) {
      throw superJsonNotDefinedError('getProviderForProfile');
    }

    return resolveProvider({
      superJson: this.superJson,
      profileId,
    });
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
