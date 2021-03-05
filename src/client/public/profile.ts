import { NormalizedProfileProviderSettings, NormalizedUsecaseDefaults } from "../../internal";
import { NonPrimitive } from "../../internal/interpreter/variables";
import { SuperfaceClient } from "./client";
import { UseCase } from "./usecase"

export class ProfileConfiguration {
	constructor(
		public readonly version: string,
		public readonly defaults: NormalizedUsecaseDefaults,
		public readonly providers: Record<string, NormalizedProfileProviderSettings>
	) {}

	get hashkey(): string {
		throw 'TODO'
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
		public readonly profileId: string,
		public readonly configuration: ProfileConfiguration
	) {

	}
	
	getUseCase(name: string): UseCase {
		return new UseCase(
			this,
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