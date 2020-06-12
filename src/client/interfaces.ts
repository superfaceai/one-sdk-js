import { Result } from '..';
import { Config } from './config';
import { Query } from './query';

export interface BoundProvider {
  perform<TParams, TResult, TError>(
    operation: string,
    params: TParams
  ): Promise<Result<TResult, TError>>;
}

export interface Provider {
  bind(config: Config): BoundProvider;
}

export interface SuperfaceClient {
  findProviders(
    profileIds: string | string[],
    query: Query
  ): Promise<Provider[]>;
}
