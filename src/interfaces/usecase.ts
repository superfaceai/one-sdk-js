import type { SecurityValues } from '@superfaceai/ast';

import type { MapInterpreterErrorBase } from '../core';
import type { NonPrimitive, Result, UnexpectedError, Variables } from '../lib';
import type { IProvider } from './provider';

export type PerformOptions = {
  provider?: IProvider | string;
  parameters?: Record<string, string>;
  security?: SecurityValues[] | { [id: string]: Omit<SecurityValues, 'id'> };
  mapVariant?: string;
  mapRevision?: string;
};

export interface IUseCase {
  perform<
    TInput extends NonPrimitive | undefined = Record<
      string,
      Variables | undefined
    >,
    TOutput = unknown
  >(
    input?: TInput,
    options?: PerformOptions
  ): Promise<Result<TOutput, MapInterpreterErrorBase | UnexpectedError>>; // TODO: ProfileParameterError
}
