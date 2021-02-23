import { MapDocumentNode, ProfileDocumentNode } from '@superfaceai/ast';
import createDebug from 'debug';
import { promises as fsp } from 'fs';
import { join as joinPath } from 'path';

import {
  MapInterpreter,
  ProfileParameterValidator,
} from '../../internal/interpreter';
import {
  castToNonPrimitive,
  mergeVariables,
  NonPrimitive,
} from '../../internal/interpreter/variables';
import {
  AuthVariables,
  FILE_URI_PROTOCOL,
  isFileURIString,
  NormalizedProfileProviderSettings,
  NormalizedSuperJsonDocument,
  SuperJson,
} from '../../internal/superjson';
import { err, ok, Result } from '../../lib';
import clone from '../../lib/clone';
import { fetchBind, ProviderJson } from './registry';

function forceCast<T>(_: unknown): asserts _ is T {}

function profileAstId(ast: ProfileDocumentNode): string {
  return ast.header.scope !== undefined
    ? ast.header.scope + '/' + ast.header.name
    : ast.header.name;
}

export type BindConfig = {
  serviceId?: string;
  auth?: AuthVariables;
  registryUrl?: string;
};

export class BoundProvider {
  private profileValidator: ProfileParameterValidator;

  constructor(
    private superJson: NormalizedSuperJsonDocument,
    private profileAst: ProfileDocumentNode,
    private provider: ProviderJson,
    private mapAst: MapDocumentNode,
    private bindConfig: BindConfig
  ) {
    this.profileValidator = new ProfileParameterValidator(this.profileAst);
  }

  private composeInput(
    usecase: string,
    input?: NonPrimitive | undefined
  ): NonPrimitive | undefined {
    const profileId = profileAstId(this.profileAst);
    const profileSettings = this.superJson.profiles[profileId];

    // obtain default from normalized super.json
    const defaultInput = castToNonPrimitive(
      profileSettings.providers[this.provider.name]?.defaults[usecase]?.input
    );

    let composed = input;
    if (defaultInput !== undefined) {
      // clone so we don't mutate super.json and resolve env for super.json values only
      const cloned = SuperJson.resolveEnvRecord(clone(defaultInput));

      // merge with input
      composed = mergeVariables(cloned, input ?? {});
    }

    return composed;
  }

  private composeAuth(): AuthVariables {
    const providerSettings = this.superJson.providers[this.provider.name];
    const defaultAuth = castToNonPrimitive(providerSettings?.auth);

    let composed = this.bindConfig.auth ?? {};
    if (defaultAuth !== undefined) {
      // clone so we don't mutate super.json and resolve env for super.json values only
      const cloned = SuperJson.resolveEnvRecord(clone(defaultAuth));

      // merge with provided auth
      composed = mergeVariables(cloned, composed);
    }

    return composed;
  }

  /**
    Performs the usecase
  */
  async perform<
    TInput extends NonPrimitive | undefined = undefined,
    TResult = unknown
  >(usecase: string, input?: TInput): Promise<Result<TResult, unknown>> {
    const composedInput = this.composeInput(usecase, input);

    const inputValidation = this.profileValidator.validate(
      composedInput,
      'input',
      usecase
    );
    if (inputValidation.isErr()) {
      return err(inputValidation.error);
    }
    forceCast<TInput>(composedInput);

    const serviceId = this.bindConfig.serviceId ?? this.provider.defaultService;
    const serviceBaseUrl = this.provider.services.find(
      s => s.id === serviceId
    )?.baseUrl;
    const interpreter = new MapInterpreter<TInput>({
      input: composedInput,
      usecase,
      serviceBaseUrl,
      auth: this.composeAuth(),
    });

    const result = await interpreter.perform(this.mapAst);

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

const providerDebug = createDebug('superface:Provider');
export class Provider {
  constructor(
    /** profile id, url or ast node */
    private profile: string | ProfileDocumentNode,
    /** provider name, url or config object */
    private provider: string | ProviderJson,
    /** url or ast node */
    private map?: string | MapDocumentNode
  ) {}

  /**
   * Binds the provider.
   *
   * This fetches the map and allows to perform.
   */
  public async bind(config?: BindConfig): Promise<BoundProvider> {
    const superJson = new SuperJson(
      (await SuperJson.loadSuperJson()).match(
        v => v,
        err => {
          providerDebug(err);

          return {};
        }
      )
    );
    const normalizedSuper = superJson.normalized;

    // resolve profile locally
    const profileAst = await this.resolveProfileAst(normalizedSuper);
    if (profileAst === undefined) {
      throw new Error('Invalid profile');
    }
    const profileId = profileAstId(profileAst);

    // resolve provider from parameters or defer until later
    // eslint-disable-next-line prefer-const
    let { providerInfo, providerName } = await this.resolveProviderInfo(
      normalizedSuper
    );

    // resolve map from parameters or defer until later
    const profileProviderSettings =
      normalizedSuper.profiles[profileId].providers[providerName];

    // eslint-disable-next-line prefer-const
    let { mapAst, mapVariant, mapRevision } = await this.resolveMapAst(
      profileProviderSettings
    );

    // resolve map ast using bind and fill in provider info if not specified
    if (mapAst === undefined) {
      // TODO: call registry bind
      const fetchResponse = await fetchBind(
        profileId +
          `@${profileAst.header.version.major}.${profileAst.header.version.minor}.${profileAst.header.version.patch}`,
        providerName,
        mapVariant,
        mapRevision,
        config?.registryUrl
      );

      providerInfo ??= fetchResponse.provider;
      mapAst = fetchResponse.mapAst;
    } else if (providerInfo === undefined) {
      // resolve only provider info if map is specified locally
      // TODO: call registry provider getter
      throw 'NOT IMPLEMENTED: map provided locally but provider is not';
    }

    return new BoundProvider(
      normalizedSuper,
      profileAst,
      providerInfo,
      mapAst,
      config ?? {}
    );
  }

  private async resolveProfileAst(
    normalizedSuper: NormalizedSuperJsonDocument
  ): Promise<ProfileDocumentNode | undefined> {
    const superfaceGrid = joinPath(process.cwd(), 'superface', 'grid');
    const profileAst = await Provider.resolveValue(
      this.profile,
      fileContents => JSON.parse(fileContents) as ProfileDocumentNode, // TODO: validate
      profileId => {
        const profileSettings = normalizedSuper.profiles[profileId];
        if (profileSettings === undefined) {
          // not found at all
          return undefined;
        } else if ('file' in profileSettings) {
          // assumed right next to source file
          return FILE_URI_PROTOCOL + profileSettings.file + '.ast.json';
        } else {
          // assumed to be in grid folder
          return (
            FILE_URI_PROTOCOL +
            joinPath(
              superfaceGrid,
              profileId + `@${profileSettings.version}.supr.ast.json`
            )
          );
        }
      }
    );

    return profileAst;
  }

  private async resolveProviderInfo(
    normalizedSuper: NormalizedSuperJsonDocument
  ): Promise<{ providerInfo?: ProviderJson; providerName: string }> {
    const providerInfo = await Provider.resolveValue<ProviderJson>(
      this.provider,
      fileContents => JSON.parse(fileContents) as ProviderJson, // TODO: validate
      providerName => {
        const providerSettings = normalizedSuper.providers[providerName];
        if (
          providerSettings !== undefined &&
          providerSettings.file !== undefined
        ) {
          // local file is resolved
          return FILE_URI_PROTOCOL + providerSettings.file;
        } else {
          // local file not specified
          return undefined;
        }
      }
    );

    if (providerInfo === undefined) {
      // if the providerInfo is undefined then this must be a string that resolveValue returned undefined for.
      forceCast<string>(this.provider);

      return { providerName: this.provider };
    } else {
      return { providerInfo, providerName: providerInfo.name };
    }
  }

  private async resolveMapAst(
    profileProviderSettings: NormalizedProfileProviderSettings | undefined
  ): Promise<{
    mapAst?: MapDocumentNode;
    mapVariant?: string;
    mapRevision?: string;
  }> {
    let localMapPath;
    if (
      profileProviderSettings !== undefined &&
      'file' in profileProviderSettings
    ) {
      localMapPath =
        FILE_URI_PROTOCOL + profileProviderSettings.file + '.ast.json';
    }
    // nice job typescript, you really deduced that one
    forceCast<
      undefined | Exclude<NormalizedProfileProviderSettings, { file: string }>
    >(profileProviderSettings);

    const mapAst = await Provider.resolveValue<MapDocumentNode>(
      this.map ?? localMapPath,
      fileContents => JSON.parse(fileContents) as MapDocumentNode, // TODO: validate
      _ => undefined
    );

    return {
      mapAst,
      mapVariant: profileProviderSettings?.mapVariant,
      mapRevision: profileProviderSettings?.mapRevision,
    };
  }

  /**
   * Returns the value resolved from the input.
   *
   * The recognized input values are:
   * * The value itself, returned straight away
   * * `undefined`, returned straight away
   * * File URI that is read and the contents are passed to the `parseFile` function
   * * For other values `unpackNested(input)` is called recursively with
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
          await fsp.readFile(input.slice(FILE_URI_PROTOCOL.length), {
            encoding: 'utf-8',
          })
        );
        // eslint-disable-next-line no-constant-condition
      } else if (false) {
        // TODO: detect remote url and fetch it, or call a callback?
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
