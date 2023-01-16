import type { PerformOptions } from '../../interfaces';
import type { NonPrimitive, Result } from '../../lib';
import type { UnexpectedError } from '../errors';
import type {
  MapInterpreterError,
  ProfileParameterError,
} from '../interpreter';
import { UseCaseBase } from './usecase';

export class TypedUseCase<
  TInput extends NonPrimitive | undefined,
  TOutput
> extends UseCaseBase {
  public async perform(
    input: TInput,
    options?: PerformOptions
  ): Promise<
    Result<
      TOutput,
      ProfileParameterError | MapInterpreterError | UnexpectedError
    >
  > {
    // Disable failover when user specified provider
    // needs to happen here because bindAndPerform is subject to retry from event hooks
    // including provider failover
    this.toggleFailover(options?.provider === undefined);

    return this.bindAndPerform(input, options);
  }
}
