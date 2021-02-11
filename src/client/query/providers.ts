import {
  // isMapDocumentNode,
  MapDocumentNode,
  ProfileDocumentNode,
} from '@superfaceai/ast';
import { promises as fsp } from 'fs';
import { join as joinPath } from 'path';

import {
  MapInterpreter,
  ProfileParameterValidator,
  ProviderConfig,
  ProviderInfo,
} from '../../internal/interpreter';
import { NonPrimitive } from '../../internal/interpreter/variables';
import {
  isFileURIString,
  loadSuperJSON,
  SuperJSONDocument,
} from '../../internal/superjson';
import { err, ok, Result } from '../../lib';
// import { fetchMapAST } from './registry';

function forceCast<T>(_: unknown): asserts _ is T {}

export class BoundProvider {
  private profileValidator: ProfileParameterValidator;

  constructor(
    private profileAST: ProfileDocumentNode,
    private mapAST: MapDocumentNode,
    private provider: ProviderInfo,
    private serviceId: string,
    private superJson?: SuperJSONDocument,
    private config?: ProviderConfig
  ) {
    this.profileValidator = new ProfileParameterValidator(this.profileAST);
  }

  /**
    Performs the usecase
  */
  async perform<
    TInput extends NonPrimitive | undefined = undefined,
    TResult = unknown
  >(usecase: string, input?: TInput): Promise<Result<TResult, unknown>> {
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
      usecase,
      provider: this.provider,
      superJson: this.superJson,
      serviceId: this.serviceId,
      config: this.config,
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

    forceCast<TResult>(result.value);

    return ok(result.value);
  }
}

export type BindConfig = {
  auth?: ProviderConfig['auth'];
  service?: string;
};

export class Provider {
  constructor(
    /** profile id, url or ast node */
    private profile: string | ProfileDocumentNode,
    /** provider name, url or config object */
    private provider: string | ProviderInfo,
    /** map variant, url or ast node */
    private map?: string | MapDocumentNode
  ) {}

  /**
   * Binds the provider.
   *
   * This fetches the map and allows to perform.
   */
  public async bind(config?: BindConfig): Promise<BoundProvider> {
    const superJson = await loadSuperJSON();

    const profileAst = await Provider.resolveValue(
      this.profile,
      fileContents => JSON.parse(fileContents) as ProfileDocumentNode, // TODO: validate?
      profileId => {
        const entry = superJson?.profiles?.[profileId];
        if (entry === undefined) {
          return undefined;
        } else {
          // TODO: I really have no idea if this is correct
          return (
            'file:' +
            joinPath(process.cwd(), 'superface', 'build', profileId) +
            '.supr.ast.json'
          );
        }
      }
    );
    if (profileAst === undefined) {
      throw new Error('Invalid profile');
    }

    const providerInfo = await Provider.resolveValue(
      this.provider,
      fileContents => JSON.parse(fileContents) as ProviderInfo, // TODO: validate?
      _input => undefined // TODO: take from registry
    );
    if (providerInfo === undefined) {
      throw new Error('Invalid provider info');
    }

    const mapAst = await Provider.resolveValue(
      this.map ?? 'default',
      fileContents => JSON.parse(fileContents) as MapDocumentNode, // TODO: validate?
      mapVariant => {
        let baseName = profileAst.header.name;
        if (profileAst.header.scope !== undefined) {
          baseName = joinPath(profileAst.header.scope, baseName);
        }

        // TODO: Where does the revision fit in here?
        let variant = '';
        if (mapVariant !== 'default') {
          variant = '.' + mapVariant;
        }

        // TODO: I really have no idea if this is correct
        return (
          'file:' +
          joinPath(process.cwd(), 'superface', 'build', baseName) +
          '.' +
          providerInfo.name +
          variant +
          '.suma.ast.json'
        );
      }
    );
    if (mapAst === undefined) {
      throw new Error('Invalid map');
    }

    return new BoundProvider(
      profileAst,
      mapAst,
      providerInfo,
      config?.service ?? providerInfo.defaultService,
      superJson,
      config
    );
  }

  // TODO: Maybe too much abstraction?
  // TODO: Put in appropriate place
  /**
   * Returns the value resolved from the input.
   *
   * The recognized input values are:
   * * The value itself, returned straight away
   * * `undefined`, returned straight away
   * * File URI that is read and the contents are passed to the `parseFile` function
   * * For other values, the function is called recursively with `unpackNested(input)`
   */
  private static async resolveValue<T>(
    input: T | string | undefined,
    parseFile: (contents: string) => T,
    unpackNested: (input: string) => T | string | undefined
  ): Promise<T | undefined> {
    if (typeof input === 'string') {
      if (isFileURIString(input)) {
        // read in files
        return parseFile(
          await fsp.readFile(input.slice('file:'.length), { encoding: 'utf-8' })
        );
        // eslint-disable-next-line no-constant-condition
      } else if (false) {
        // TODO: detect remote url and fetch it, or call a callback
      } else {
        // unpack nested and recursively process them
        const nested = unpackNested(input);

        return Provider.resolveValue(nested, parseFile, unpackNested);
      }
    } else {
      // return undefined and T
      return input;
    }
  }
}
