import {
  Events,
  IBoundProfileProvider,
  IConfig,
  ICrypto,
  IFileSystem,
  ILogger,
  ITimers,
  UseCase,
} from '~core';
import { SuperCache } from '~lib';
import { SuperJson } from '~schema-tools';

export class ProfileConfiguration {
  constructor(public readonly id: string, public readonly version: string) {}

  public get cacheKey(): string {
    // TODO: Research a better way?
    return JSON.stringify(this);
  }
}

export abstract class ProfileBase {
  constructor(
    public readonly configuration: ProfileConfiguration,
    protected readonly events: Events,
    protected readonly superJson: SuperJson,
    protected readonly config: IConfig,
    protected readonly timers: ITimers,
    protected readonly fileSystem: IFileSystem,
    protected readonly boundProfileProviderCache: SuperCache<{
      provider: IBoundProfileProvider;
      expiresAt: number;
    }>,
    protected readonly crypto: ICrypto,
    protected readonly logger?: ILogger
  ) {}

  public getConfiguredProviders(): string[] {
    return Object.keys(
      this.superJson.normalized.profiles[this.configuration.id]?.providers ?? {}
    );
  }
}

export class Profile extends ProfileBase {
  public getUseCase(name: string): UseCase {
    // TODO: Check if usecase exists

    return new UseCase(
      this.configuration,
      name,
      this.events,
      this.config,
      this.superJson,
      this.timers,
      this.fileSystem,
      this.crypto,
      this.boundProfileProviderCache,
      this.logger
    );
  }
}
