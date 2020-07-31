import { Config } from './config';
import { Provider } from './Provider';
import { Query } from './query';

export class SuperfaceClient {
  constructor(private readonly config: Config) {}

  public async findProviders(
    _profileIds: string | string[],
    query: Query
  ): Promise<Provider[]> {
    if (!query.ast) {
      throw new Error('Method not implemented.');
    }

    return [new Provider(this.config, query.ast.profileAST)];
  }
}
