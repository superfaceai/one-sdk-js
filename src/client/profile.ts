import { ProfileDocumentNode } from '@superfaceai/ast';

import { UnexpectedError } from '../internal/errors';
import { usecaseNotFoundError } from '../internal/errors.helpers';
import { NonPrimitive } from '../internal/interpreter/variables';
import { SuperfaceClientBase } from './client';
import { TypedUseCase, UseCase } from './usecase';

export class ProfileConfiguration {
  constructor(public readonly id: string, public readonly version: string) {}

  get cacheKey(): string {
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

export class ProfileBase {
  constructor(
    public readonly client: SuperfaceClientBase,
    public readonly configuration: ProfileConfiguration,
    public readonly ast: ProfileDocumentNode
  ) {}

  getConfiguredProviders(): string[] {
    return Object.keys(
      this.client.superJson.normalized.profiles[this.configuration.id]
        ?.providers ?? {}
    );
  }
}

export class Profile extends ProfileBase {
  getUseCase(name: string): UseCase {
    return new UseCase(this, name);
  }
}

export class TypedProfile<
  // TKnownUsecases extends KnownUsecase<string, NonPrimitive, unknown>
  TUsecaseTypes extends UsecaseType
> extends ProfileBase {
  private readonly knownUsecases: KnownUsecase<TUsecaseTypes>;

  constructor(
    public override readonly client: SuperfaceClientBase,
    public override readonly configuration: ProfileConfiguration,
    public override readonly ast: ProfileDocumentNode,
    usecases: (keyof TUsecaseTypes)[]
  ) {
    super(client, configuration, ast);
    this.knownUsecases = usecases.reduce(
      (acc, usecase) => ({
        ...acc,
        [usecase]: new TypedUseCase<
          TUsecaseTypes[typeof usecase][0],
          TUsecaseTypes[typeof usecase][1]
        >(this, usecase as string),
      }),
      {} as KnownUsecase<TUsecaseTypes>
    );
  }

  get useCases(): KnownUsecase<TUsecaseTypes> {
    if (this.knownUsecases === undefined) {
      throw new UnexpectedError(
        'Thou shall not access the typed interface from untyped Profile'
      );
    } else {
      return this.knownUsecases;
    }
  }

  getUseCase<TName extends keyof KnownUsecase<TUsecaseTypes>>(
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
