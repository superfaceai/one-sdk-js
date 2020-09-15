import { MapASTNode, ProfileASTNode } from '@superindustries/language';

import {
  MapInterpreter,
  ProfileParameterValidator,
} from '../../internal/interpreter';
import { err, ok, Result } from '../../lib';
import { Config } from '../config';
import { fetchMapAST } from './registry';

function isUnknown<T>(_: unknown): _ is T {
  return true;
}

export class BoundProvider<TInput, TResult = unknown> {
  private profileValidator: ProfileParameterValidator;

  constructor(
    private profileAST: ProfileASTNode,
    private mapAST: MapASTNode,
    private config: Config,
    private usecase: string,
    private baseUrl: string,
    private validationFunction: (input: unknown) => input is TResult = isUnknown
  ) {
    this.profileValidator = new ProfileParameterValidator(this.profileAST);
  }

  async perform(input: TInput): Promise<Result<TResult, unknown>> {
    this.profileValidator.validate(input, 'input', this.usecase);

    const interpreter = new MapInterpreter<TInput>({
      input,
      auth: this.config.auth,
      usecase: this.usecase,
      baseUrl: this.baseUrl,
    });

    const result = await interpreter.visit(this.mapAST);

    this.profileValidator.validate(result, 'result', this.usecase);

    if (this.validationFunction(result)) {
      return ok(result);
    }

    return err('Result did not validate correctly');
  }
}

export class Provider<TParams, TResult = unknown> {
  constructor(
    private profileAST: ProfileASTNode,
    private mapUrl: string,
    private usecase: string,
    private baseUrl: string,
    private validationFunction?: (input: unknown) => input is TResult
  ) {}

  public async bind(config: Config): Promise<BoundProvider<TParams, TResult>> {
    const mapAST = await fetchMapAST(this.mapUrl);

    return new BoundProvider<TParams, TResult>(
      this.profileAST,
      mapAST,
      config,
      this.usecase,
      this.baseUrl,
      this.validationFunction
    );
  }
}
