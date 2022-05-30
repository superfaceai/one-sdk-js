import { clone } from '../object';
import { MaybePromise } from '../types';

export async function pipe<T>(
  initial: T,
  ...filters: ((input: T) => MaybePromise<T>)[]
): Promise<T> {
  let accumulator = clone(initial);

  for (const filter of filters) {
    accumulator = await filter(accumulator);
  }

  return accumulator;
}
