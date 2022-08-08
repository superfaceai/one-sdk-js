import type { SecurityValues } from '@superfaceai/ast';

export interface IProviderConfiguration {
  name: string;
  /** @deprecated only for use in testing library */
  security: SecurityValues[];
  cacheKey: string;
}

export interface IProvider {
  configuration: IProviderConfiguration;
  configure(configuration?: {
    security?: SecurityValues[];
  }): Promise<IProvider>;
}
