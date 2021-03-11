import { NonPrimitive } from "../../internal/interpreter/variables";
import { SuperfaceClient } from "./client";
import { UseCase } from "./usecase"

export class ProfileConfiguration {
  constructor(
    public readonly id: string,
    public readonly version: string
  ) { }

  get cacheKey(): string {
    // TOOD: Research a better way?
    throw JSON.stringify(this);
  }
}

// TODO: This is just an idea of how the interface might look like.
export type KnownUsecase<
  TName extends string,
  TInput extends NonPrimitive,
  TOutput
  > = { [name in TName]: UseCase<TInput, TOutput> };

export class Profile<TKnownUsecases extends KnownUsecase<string, NonPrimitive, unknown> = never> {
  private readonly knownUsecases?: TKnownUsecases;

  constructor(
    public readonly client: SuperfaceClient,
    public readonly configuration: ProfileConfiguration
  ) {

  }

  getUseCase(name: string): UseCase {
    return new UseCase(
      this as unknown as Profile<never>,
      name
    );
  }

  get useCases(): TKnownUsecases {
    if (this.knownUsecases === undefined) {
      throw new Error('Thou shall not access the typed interface from untyped Profile');
    } else {
      return this.knownUsecases;
    }
  }
}