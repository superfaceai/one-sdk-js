import {
  MapDocumentNode,
  ProfileDocumentNode,
} from '@superindustries/language';

import { Result } from '..';
import { Variables } from '../internal/interpreter/interfaces';
import { MapInterpereter } from '../internal/interpreter/map-interpreter';
import { err, ok } from '../lib';
import { Config } from './config';

// TODO: Create Profile walker for validation of result
export const mapResult = <TResult>(
  _profileAST: ProfileDocumentNode,
  result?: string | Variables
): TResult => {
  return (result as unknown) as TResult;
};

export class BoundProvider {
  constructor(
    private readonly config: Config,
    private readonly profileAST: ProfileDocumentNode,
    private readonly mapAST: MapDocumentNode
  ) {}

  async perform<TResult, TError>(
    usecase: string,
    input?: Variables
  ): Promise<Result<TResult, TError>> {
    try {
      const interpreter = new MapInterpereter({
        usecase,
        auth: this.config.auth,
        input,
      });

      const result = await interpreter.visit(this.mapAST);
      const mappedResult = mapResult<TResult>(this.profileAST, result);

      return ok(mappedResult);
    } catch (e) {
      return err(e);
    }
  }
}

export class Provider {
  constructor(
    private readonly config: Config,
    private readonly profileAST: ProfileDocumentNode
  ) {}

  public async bind(mapAST?: MapDocumentNode): Promise<BoundProvider> {
    if (!mapAST) {
      throw new Error('Method not implemented');
    }

    return new BoundProvider(this.config, this.profileAST, mapAST);
  }
}
