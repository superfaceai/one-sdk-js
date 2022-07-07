import type {
  NormalizedSuperJsonDocument,
  ProfileDocumentNode,
} from '@superfaceai/ast';
import { isUseCaseDefinitionNode } from '@superfaceai/ast';

import type {
  IConfig,
  ICrypto,
  IFileSystem,
  ILogger,
  ITimers,
} from '../../interfaces';
import type { SuperCache } from '../../lib';
import { usecaseNotFoundError } from '../errors';
import type { Events, Interceptable } from '../events';
import type { AuthCache, IFetch } from '../interpreter';
import type { IBoundProfileProvider } from '../profile-provider';
import { UseCase } from '../usecase';
import type { ProfileConfiguration } from './profile-configuration';

export abstract class ProfileBase {
  constructor(
    public readonly configuration: ProfileConfiguration,
    public readonly ast: ProfileDocumentNode,
    protected readonly events: Events,
    protected readonly superJson: NormalizedSuperJsonDocument | undefined,
    protected readonly config: IConfig,
    protected readonly timers: ITimers,
    protected readonly fileSystem: IFileSystem,
    protected readonly boundProfileProviderCache: SuperCache<{
      provider: IBoundProfileProvider;
      expiresAt: number;
    }>,
    protected readonly crypto: ICrypto,
    protected readonly fetchInstance: IFetch & Interceptable & AuthCache,
    protected readonly logger?: ILogger
  ) {}

  public getConfiguredProviders(): string[] {
    return Object.keys(
      this.superJson?.profiles[this.configuration.id]?.providers ?? {}
    );
  }
}

export class Profile extends ProfileBase {
  public getUseCase(name: string): UseCase {
    const supportedUsecaseNames = this.ast.definitions
      .filter(isUseCaseDefinitionNode)
      .map(u => u.useCaseName);
    if (!supportedUsecaseNames.includes(name)) {
      throw usecaseNotFoundError(name, supportedUsecaseNames);
    }

    return new UseCase(
      this,
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
