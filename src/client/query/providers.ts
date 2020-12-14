import {
  isMapDocumentNode,
  MapDocumentNode,
  ProfileDocumentNode,
} from '@superfaceai/ast';

import { UnexpectedError } from '../../internal/errors';
import {
  MapInterpreter,
  ProfileParameterValidator,
} from '../../internal/interpreter';
import { NonPrimitive } from '../../internal/interpreter/variables';
import { err, ok, Result } from '../../lib';
import { Config } from '../config';
import { fetchMapAST } from './registry';

function forceCast<T>(_: unknown): _ is T {
  return true;
}

export class BoundProvider {
  private profileValidator: ProfileParameterValidator;

  constructor(
    private profileAST: ProfileDocumentNode,
    private mapAST: MapDocumentNode,
    private config: Config,
    // private usecase: string,
    private baseUrl?: string // private validationFunction: (input: unknown) => input is TResult = isUnknown
  ) {
    this.profileValidator = new ProfileParameterValidator(this.profileAST);
  }

  /**
    Performs the usecase
  */
  async perform<TInput extends NonPrimitive, TResult = unknown>(
    input: TInput,
    usecase: string
  ): Promise<Result<TResult, unknown>> {
    const inputValidation = this.profileValidator.validate(
      input,
      'input',
      usecase
    );

    if (inputValidation.isErr()) {
      return err(inputValidation.error);
    }

    const interpreter = new MapInterpreter<TInput>({
      input,
      auth: this.config.auth,
      usecase,
      baseUrl: this.baseUrl,
    });

    const result = await interpreter.perform(this.mapAST);

    if (result.isErr()) {
      return err(result.error);
    }

    const resultValidation = this.profileValidator.validate(
      result.value,
      'result',
      usecase
    );

    if (resultValidation.isErr()) {
      return err(resultValidation.error);
    }

    if (forceCast<TResult>(result.value)) {
      return ok(result.value);
    }

    return err(
      new UnexpectedError(
        'This should be unreachable; how did you reach it? Are you magic?'
      )
    );
  }

  public get serviceId(): string | undefined {
    return this.baseUrl;
  }
}

export class Provider {
  constructor(
    private profileAST: ProfileDocumentNode,
    private mapUrlOrMapAST: string | MapDocumentNode,
    // private usecase: string,
    private baseUrl?: string // private validationFunction?: (input: unknown) => input is TResult
  ) {}

  /**
   * Binds the provider.
   *
   * This fetches the map and allows to perform.
   */
  public async bind(config: Config): Promise<BoundProvider> {
    const mapAST = await this.obtainMapAST();

    return new BoundProvider(
      this.profileAST,
      mapAST,
      config,
      // this.usecase,
      this.baseUrl
      // this.validationFunction
    );
  }

  /**
   * If mapUrlOrMapAST is string, interpret it as URL and fetch map from there.
   * Otherwise, interpret it as MapASTNode
   */
  private async obtainMapAST(): Promise<MapDocumentNode> {
    if (typeof this.mapUrlOrMapAST === 'string') {
      return fetchMapAST(this.mapUrlOrMapAST);
    } else if (isMapDocumentNode(this.mapUrlOrMapAST)) {
      return this.mapUrlOrMapAST;
    }

    throw new Error('Invalid Map AST or URL!');
  }

  public get serviceId(): string | undefined {
    return this.baseUrl;
  }
}
