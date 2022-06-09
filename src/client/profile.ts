import { Config } from '../config';
import { SuperJson, UnexpectedError } from '../internal';
import { usecaseNotFoundError } from '../internal/errors.helpers';
import { NonPrimitive } from '../internal/interpreter/variables';
import { ICrypto } from '../lib/crypto';
import { Events } from '../lib/events';
import { IFileSystem } from '../lib/io';
import { ILogger } from '../lib/logger/logger';
import { ITimers } from '../lib/timers';
import { SuperCache } from './cache';
import { IBoundProfileProvider } from './profile-provider';
import { TypedUseCase, UseCase } from './usecase';

export class ProfileConfiguration {
  constructor(public readonly id: string, public readonly version: string) {}

  public get cacheKey(): string {
    // TODO: Research a better way?
    return JSON.stringify(this);
  }
}

export type UsecaseType<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TInput extends NonPrimitive | undefined = any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TOutput = any
> = {
  [name: string]: [TInput, TOutput];
};

export type KnownUsecase<TUsecase extends UsecaseType> = {
  [name in keyof TUsecase]: TypedUseCase<TUsecase[name][0], TUsecase[name][1]>;
};

export abstract class ProfileBase {
  constructor(
    public readonly configuration: ProfileConfiguration,
    protected readonly events: Events,
    protected readonly superJson: SuperJson,
    protected readonly config: Config,
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

export class TypedProfile<
  // TKnownUsecases extends KnownUsecase<string, NonPrimitive, unknown>
  TUsecaseTypes extends UsecaseType
> extends ProfileBase {
  private readonly knownUsecases: KnownUsecase<TUsecaseTypes>;

  constructor(
    public override readonly configuration: ProfileConfiguration,
    protected override readonly events: Events,
    protected override readonly superJson: SuperJson,
    protected override readonly boundProfileProviderCache: SuperCache<{
      provider: IBoundProfileProvider;
      expiresAt: number;
    }>,
    protected override readonly config: Config,
    protected override readonly timers: ITimers,
    protected override readonly fileSystem: IFileSystem,
    protected override readonly crypto: ICrypto,
    usecases: (keyof TUsecaseTypes)[],
    protected override readonly logger?: ILogger
  ) {
    super(
      configuration,
      events,
      superJson,
      config,
      timers,
      fileSystem,
      boundProfileProviderCache,
      crypto,
      logger
    );
    this.knownUsecases = usecases.reduce(
      (acc, usecase) => ({
        ...acc,
        [usecase]: new TypedUseCase<
          TUsecaseTypes[typeof usecase][0],
          TUsecaseTypes[typeof usecase][1]
        >(
          configuration,
          usecase as string,
          events,
          config,
          superJson,
          timers,
          fileSystem,
          crypto,
          boundProfileProviderCache,
          logger
        ),
      }),
      {} as KnownUsecase<TUsecaseTypes>
    );
  }

  public get useCases(): KnownUsecase<TUsecaseTypes> {
    if (this.knownUsecases === undefined) {
      throw new UnexpectedError(
        'Thou shall not access the typed interface from untyped Profile'
      );
    } else {
      return this.knownUsecases;
    }
  }

  public getUseCase<TName extends keyof KnownUsecase<TUsecaseTypes>>(
    name: TName
  ): KnownUsecase<TUsecaseTypes>[TName] {
    const usecase = this.knownUsecases?.[name];
    if (!usecase) {
      throw usecaseNotFoundError(
        name.toString(),
        Object.keys(this.knownUsecases)
      );
    }

    return usecase;
  }
}
