import type {
  NormalizedSuperJsonDocument,
  ProfileDocumentNode,
} from '@superfaceai/ast';

import type {
  IConfig,
  ICrypto,
  IFileSystem,
  ILogger,
  ITimers,
} from '../../interfaces';
import type { NonPrimitive, SuperCache } from '../../lib';
import { UnexpectedError, usecaseNotFoundError } from '../errors';
import type { Events, Interceptable } from '../events';
import type { AuthCache, IFetch } from '../interpreter';
import type { IBoundProfileProvider } from '../profile-provider';
import { TypedUseCase } from '../usecase';
import { ProfileBase } from './profile';
import type { ProfileConfiguration } from './profile-configuration';

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

export class TypedProfile<
  // TKnownUsecases extends KnownUsecase<string, NonPrimitive, unknown>
  TUsecaseTypes extends UsecaseType
> extends ProfileBase {
  private readonly knownUsecases: KnownUsecase<TUsecaseTypes>;

  constructor(
    public override readonly configuration: ProfileConfiguration,
    public override readonly ast: ProfileDocumentNode,
    protected override readonly events: Events,
    protected override readonly superJson:
      | NormalizedSuperJsonDocument
      | undefined,
    protected override readonly boundProfileProviderCache: SuperCache<{
      provider: IBoundProfileProvider;
      expiresAt: number;
    }>,
    protected override readonly config: IConfig,
    protected override readonly timers: ITimers,
    protected override readonly fileSystem: IFileSystem,
    protected override readonly crypto: ICrypto,
    protected override readonly fetchInstance: IFetch &
      Interceptable &
      AuthCache,
    usecases: (keyof TUsecaseTypes)[],
    protected override readonly logger?: ILogger
  ) {
    super(
      configuration,
      ast,
      events,
      superJson,
      config,
      timers,
      fileSystem,
      boundProfileProviderCache,
      crypto,
      fetchInstance,
      logger
    );
    this.knownUsecases = usecases.reduce(
      (acc, usecase) => ({
        ...acc,
        [usecase]: new TypedUseCase<
          TUsecaseTypes[typeof usecase][0],
          TUsecaseTypes[typeof usecase][1]
        >(
          this,
          usecase as string,
          events,
          config,
          superJson,
          timers,
          fileSystem,
          crypto,
          boundProfileProviderCache,
          fetchInstance,
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
