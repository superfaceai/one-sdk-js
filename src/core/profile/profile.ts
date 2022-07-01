import { SuperCache } from '../../lib';
import { SuperJson } from '../../schema-tools';
import { Events, Interceptable } from '../events';
import { IConfig, ICrypto, IFileSystem, ILogger, ITimers } from '../interfaces';
import { AuthCache, FetchInstance } from '../interpreter';
import { IBoundProfileProvider } from '../profile-provider';
import { UseCase } from '../usecase';
import { ProfileConfiguration } from './profile-configuration';

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
    protected readonly fetchInstance: FetchInstance & Interceptable & AuthCache,
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
      this.fetchInstance,
      this.logger
    );
  }
}
