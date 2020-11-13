import { MapASTNode, ProfileASTNode } from '@superfaceai/language';

import {
  MapInterpreter,
  ProfileParameterValidator,
} from '../../internal/interpreter';
import { NonPrimitive } from '../../internal/interpreter/variables';
import { err, ok, Result } from '../../lib';
import { Config } from '../config';
import { fetchMapAST } from './registry';

function isUnknown<T>(_: unknown): _ is T {
  return true;
}

export class BoundProvider<TInput extends NonPrimitive, TResult = unknown> {
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

  /**
    Performs the usecase
  */
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

  public get serviceId(): string {
    return this.baseUrl;
  }
}

export class Provider<TParams extends NonPrimitive, TResult = unknown> {
  constructor(
    private profileAST: ProfileASTNode,
    private mapUrlOrMapAST: string | MapASTNode,
    private usecase: string,
    private baseUrl: string,
    private validationFunction?: (input: unknown) => input is TResult
  ) { }

  /**
   * Binds the provider.
   *
   * This fetches the map and allows to perform.
   */
  public async bind(config: Config): Promise<BoundProvider<TParams, TResult>> {
    const mapAST = await this.obtainMapAST();

    return new BoundProvider<TParams, TResult>(
      this.profileAST,
      mapAST,
      config,
      this.usecase,
      this.baseUrl,
      this.validationFunction
    );
  }

  /**
   * If mapUrlOrMapAST is string, interpret it as URL and fetch map from there.
   * Otherwise, interpret it as MapASTNode
   */
  private async obtainMapAST() {
    if (typeof this.mapUrlOrMapAST === 'string' || this.mapUrlOrMapAST instanceof String) {
      return fetchMapAST(this.mapUrlOrMapAST as string);
    } else {
      return this.mapUrlOrMapAST;
    }
  }

  public get serviceId(): string {
    return this.baseUrl;
  }
}
