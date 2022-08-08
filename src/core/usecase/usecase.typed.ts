import type { PerformError, PerformOptions } from '../../interfaces';
import type { NonPrimitive, Result, UnexpectedError } from '../../lib';
import { UseCaseBase } from './usecase';

export class TypedUseCase<
  TInput extends NonPrimitive | undefined,
  TOutput
> extends UseCaseBase {
  public async perform(
    input: TInput,
    options?: PerformOptions
  ): Promise<Result<TOutput, PerformError | UnexpectedError>> {
    // Disable failover when user specified provider
    // needs to happen here because bindAndPerform is subject to retry from event hooks
    // including provider failover
    this.toggleFailover(options?.provider === undefined);

    return this.bindAndPerform(input, options);
  }
}
