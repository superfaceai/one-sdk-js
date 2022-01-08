import { Config } from '../config';
import { SuperJson } from '../internal';
import { NonPrimitive } from '../internal/interpreter/variables';
import { Events } from '../lib/events';
import { SuperCache } from './cache';
import { IBoundProfileProvider } from './profile-provider';
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
    public readonly configuration: ProfileConfiguration,
    protected readonly events: Events,
    protected readonly superJson: SuperJson,
    protected readonly config: Config,
    protected readonly boundProfileProviderCache: SuperCache<IBoundProfileProvider>
  ) {}
}

export class Profile extends ProfileBase {
  getUseCase(name: string): UseCase {
    // TODO: Check if usecase exists

    return new UseCase(
      this.configuration,
      name,
      this.events,
      this.config,
      this.superJson,
      this.boundProfileProviderCache
    );
  }
}

// export class TypedProfile<
//   // TKnownUsecases extends KnownUsecase<string, NonPrimitive, unknown>
//   TUsecaseTypes extends UsecaseType
// > extends ProfileBase {
//   private readonly knownUsecases: KnownUsecase<TUsecaseTypes>;

//   constructor(
//     public override readonly configuration: ProfileConfiguration,
//     protected override readonly events: Events,
//     protected override readonly superJson: SuperJson,
//     protected override readonly boundProfileProviderCache: SuperCache<BoundProfileProvider>,
//     usecases: (keyof TUsecaseTypes)[]
//   ) {
//     super(configuration, events, superJson, boundProfileProviderCache);
//     this.knownUsecases = usecases.reduce(
//       (acc, usecase) => ({
//         ...acc,
//         [usecase]: new TypedUseCase<
//           TUsecaseTypes[typeof usecase][0],
//           TUsecaseTypes[typeof usecase][1]
//         >(
//           configuration,
//           usecase as string,
//           events,
//           superJson,
//           boundProfileProviderCache
//         ),
//       }),
//       {} as KnownUsecase<TUsecaseTypes>
//     );
//   }

//   get useCases(): KnownUsecase<TUsecaseTypes> {
//     if (this.knownUsecases === undefined) {
//       throw new UnexpectedError(
//         'Thou shall not access the typed interface from untyped Profile'
//       );
//     } else {
//       return this.knownUsecases;
//     }
//   }

//   getUseCase<TName extends keyof KnownUsecase<TUsecaseTypes>>(
//     name: TName
//   ): KnownUsecase<TUsecaseTypes>[TName] {
//     const usecase = this.knownUsecases?.[name];
//     if (!usecase) {
//       throw usecaseNotFoundError(
//         name.toString(),
//         Object.keys(this.knownUsecases)
//       );
//     }

//     return usecase;
//   }
// }
