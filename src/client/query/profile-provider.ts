import { MapDocumentNode, ProfileDocumentNode } from '@superfaceai/ast';
import createDebug from 'debug';
import { promises as fsp } from 'fs';
import { join as joinPath } from 'path';

import {
  HttpScheme,
  ProviderJson,
  SecurityConfiguration,
  SecurityScheme,
  SecurityType,
} from '../../internal';
import {
  MapInterpreter,
  MapInterpreterError,
  ProfileParameterError,
  ProfileParameterValidator,
} from '../../internal/interpreter';
import {
  castToNonPrimitive,
  mergeVariables,
  NonPrimitive,
} from '../../internal/interpreter/variables';
import {
  FILE_URI_PROTOCOL,
  isApiKeySecurityValues,
  isBasicAuthSecurityValues,
  isBearerTokenSecurityValues,
  isDigestSecurityValues,
  isFileURIString,
  NormalizedProfileProviderSettings,
  SecurityValues,
  SuperJson,
} from '../../internal/superjson';
import { err, ok, Result } from '../../lib';
import { ProfileConfiguration, ProviderConfiguration } from '../public';
import { fetchBind } from './registry';

function forceCast<T>(_: unknown): asserts _ is T {}

function profileAstId(ast: ProfileDocumentNode): string {
  return ast.header.scope !== undefined
    ? ast.header.scope + '/' + ast.header.name
    : ast.header.name;
}

const boundProfileProviderDebug = createDebug('superface:BoundProfileProvider');
export class BoundProfileProvider {
  private profileValidator: ProfileParameterValidator;

  constructor(
    private readonly profileAst: ProfileDocumentNode,
    private readonly mapAst: MapDocumentNode,
    private readonly configuration: {
      baseUrl?: string;
      profileProviderSettings?: NormalizedProfileProviderSettings;
      security: SecurityConfiguration[];
      /** Selected service id */
      serviceId?: string;
    }
  ) {
    this.profileValidator = new ProfileParameterValidator(this.profileAst);
  }

  private composeInput(
    usecase: string,
    input?: NonPrimitive | undefined
  ): NonPrimitive | undefined {
    let composed = input;

    const defaultInput = castToNonPrimitive(
      this.configuration.profileProviderSettings?.defaults[usecase]?.input
    );
    if (defaultInput !== undefined) {
      composed = mergeVariables(defaultInput, input ?? {});
      boundProfileProviderDebug('Composed input with defaults:', composed);
    }

    return composed;
  }

  /**
   * Performs the usecase while validating input and output against the profile definition.
   *
   * Note that the `TInput` and `TResult` types cannot be checked for compatibility with the profile definition, so the caller
   * is responsible for ensuring that the cast is safe.
   */
  async perform<
    TInput extends NonPrimitive | undefined = undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    TResult = any
  >(
    usecase: string,
    input?: TInput
  ): Promise<Result<TResult, ProfileParameterError | MapInterpreterError>> {
    // compose and validate the input
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

    // create and perform interpreter instance
    const interpreter = new MapInterpreter<TInput>({
      input: composedInput,
      usecase,
      serviceBaseUrl: this.configuration.baseUrl,
      security: this.configuration.security,
    });

    const result = await interpreter.perform(this.mapAst);
    if (result.isErr()) {
      return err(result.error);
    }

    // validate output
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

export type BindConfiguration = {
  serviceId?: string;
  security?: SecurityValues[];
  registryUrl?: string;
};

const profileProviderDebug = createDebug('superface:ProfileProvider');
export class ProfileProvider {
  constructor(
    /** Preloaded superJson instance */
    public readonly superJson: SuperJson,
    /** profile id, url, ast node or configuration instance */
    private profile: string | ProfileDocumentNode | ProfileConfiguration,
    /** provider name, url or configuration instance */
    private provider: string | ProviderJson | ProviderConfiguration,
    /** url or ast node */
    private map?: string | MapDocumentNode
  ) {}

  /**
   * Binds the provider.
   *
   * This fetches the unspecified data (provider information and map ast) from registry.
   */
  public async bind(
    configuration?: BindConfiguration
  ): Promise<BoundProfileProvider> {
    // resolve profile locally
    const profileAst = await this.resolveProfileAst();
    if (profileAst === undefined) {
      throw new Error('Invalid profile');
    }
    const profileId = profileAstId(profileAst);

    // resolve provider from parameters or defer until later
    // JESUS: Why can't I unpack this without fighting the linter
    // eslint-disable-next-line prefer-const
    let { providerInfo, providerName } = await this.resolveProviderInfo();
    const securityValues = this.resolveSecurityValues(
      providerName,
      configuration?.security
    );

    // resolve map from parameters or defer until later
    // eslint-disable-next-line prefer-const
    let { mapAst, mapVariant, mapRevision } = await this.resolveMapAst(
      `${profileId}.${providerName}`
    );

    // resolve map ast using bind and fill in provider info if not specified
    if (mapAst === undefined) {
      const fetchResponse = await fetchBind(
        {
          profileId:
            profileId +
            `@${profileAst.header.version.major}.${profileAst.header.version.minor}.${profileAst.header.version.patch}`,
          provider: providerName,
          mapVariant,
          mapRevision,
        },
        {
          registryUrl: configuration?.registryUrl,
        }
      );

      providerInfo ??= fetchResponse.provider;
      mapAst = fetchResponse.mapAst;
    } else if (providerInfo === undefined) {
      // resolve only provider info if map is specified locally
      // TODO: call registry provider getter
      throw 'NOT IMPLEMENTED: map provided locally but provider is not';
    }

    // prepare service info
    const serviceId = configuration?.serviceId ?? providerInfo.defaultService;
    const baseUrl = providerInfo.services.find(s => s.id === serviceId)
      ?.baseUrl;

    const securityConfiguration = this.resolveSecurityConfiguration(
      providerInfo.securitySchemes ?? [],
      securityValues
    );

    return new BoundProfileProvider(profileAst, mapAst, {
      baseUrl,
      profileProviderSettings: this.superJson.normalized.profiles[profileId]
        ?.providers[providerInfo.name],
      security: securityConfiguration,
      serviceId: configuration?.serviceId,
    });
  }

  private async resolveProfileAst(): Promise<ProfileDocumentNode | undefined> {
    let resolveInput = this.profile;
    if (resolveInput instanceof ProfileConfiguration) {
      resolveInput = resolveInput.id;
    }

    const profileAst = await ProfileProvider.resolveValue(
      resolveInput,
      fileContents => JSON.parse(fileContents) as ProfileDocumentNode, // TODO: validate
      profileId => {
        const profileSettings = this.superJson.normalized.profiles[profileId];
        if (profileSettings === undefined) {
          // not found at all
          return undefined;
        } else if ('file' in profileSettings) {
          // assumed right next to source file
          return (
            FILE_URI_PROTOCOL +
            this.superJson.resolvePath(profileSettings.file) +
            '.ast.json'
          );
        } else {
          // assumed to be in grid folder
          return (
            FILE_URI_PROTOCOL +
            this.superJson.resolvePath(
              joinPath(
                'grid',
                profileId + `@${profileSettings.version}.supr.ast.json`
              )
            )
          );
        }
      }
    );

    return profileAst;
  }

  private async resolveProviderInfo(): Promise<{
    providerInfo?: ProviderJson;
    providerName: string;
  }> {
    let resolveInput = this.provider;
    if (resolveInput instanceof ProviderConfiguration) {
      resolveInput = resolveInput.name;
    }

    const providerInfo = await ProfileProvider.resolveValue<ProviderJson>(
      resolveInput,
      fileContents => JSON.parse(fileContents) as ProviderJson, // TODO: validate
      providerName => {
        const providerSettings = this.superJson.normalized.providers[
          providerName
        ];
        if (providerSettings?.file !== undefined) {
          // local file is resolved
          return (
            FILE_URI_PROTOCOL +
            this.superJson.resolvePath(providerSettings.file)
          );
        } else {
          // local file not specified
          return undefined;
        }
      }
    );

    let providerName;
    if (providerInfo === undefined) {
      // if the providerInfo is undefined then this must be a string that resolveValue returned undefined for.
      forceCast<string>(resolveInput);

      providerName = resolveInput;
    } else {
      providerName = providerInfo.name;
    }

    return { providerInfo, providerName };
  }

  private async resolveMapAst(
    mapId: string
  ): Promise<{
    mapAst?: MapDocumentNode;
    mapVariant?: string;
    mapRevision?: string;
  }> {
    const mapInfo: { mapVariant?: string; mapRevision?: string } = {};
    const mapAst = await ProfileProvider.resolveValue<MapDocumentNode>(
      this.map ?? mapId,
      fileContents => JSON.parse(fileContents) as MapDocumentNode, // TODO: validate
      mapId => {
        const [profileId, providerName] = mapId.split('.');
        const profileProviderSettings = this.superJson.normalized.profiles[
          profileId
        ].providers[providerName];

        if (profileProviderSettings === undefined) {
          return undefined;
        } else if ('file' in profileProviderSettings) {
          return (
            FILE_URI_PROTOCOL +
            this.superJson.resolvePath(profileProviderSettings.file) +
            '.ast.json'
          );
        } else {
          mapInfo.mapVariant = profileProviderSettings.mapVariant;
          mapInfo.mapRevision = profileProviderSettings.mapRevision;

          return undefined;
        }
      }
    );

    return {
      mapAst,
      ...mapInfo,
    };
  }

  /**
   * Returns the value resolved from the input.
   *
   * The recognized input values are:
   * * The value itself, returned straight away
   * * `undefined`, returned straight away
   * * File URI that is read and the contents are passed to the `parseFile` function
   * * For other values `unpackNested(input)` is called recursively
   */
  private static async resolveValue<T>(
    input: T | string | undefined,
    parseFile: (contents: string) => T,
    unpackNested: (input: string) => T | string | undefined
  ): Promise<T | undefined> {
    if (typeof input === 'string') {
      if (isFileURIString(input)) {
        profileProviderDebug('Resolving input as file:', input);

        // read in files
        return parseFile(
          await fsp.readFile(input.slice(FILE_URI_PROTOCOL.length), {
            encoding: 'utf-8',
          })
        );
        // eslint-disable-next-line no-constant-condition
      } else if (false) {
        profileProviderDebug('Resolving input as url:', input);
        // TODO: detect remote url and fetch it, or call a callback?
      } else {
        profileProviderDebug('Resolving input as nested value:', input);
        // unpack nested and recursively process them
        const nested = unpackNested(input);

        return ProfileProvider.resolveValue(nested, parseFile, unpackNested);
      }
    } else {
      // return undefined and T
      return input;
    }
  }

  /**
   * Resolves auth variables by applying the provided overlay over the base variables.
   *
   * The base variables either come from super.json or from `this.provider` if it is an instance of `ProviderConfiguration`
   */
  private resolveSecurityValues(
    providerName: string,
    overlay?: SecurityValues[]
  ): SecurityValues[] {
    let base: SecurityValues[];
    if (this.provider instanceof ProviderConfiguration) {
      base = this.provider.security;
    } else {
      base = this.superJson.normalized.providers[providerName]?.security;
    }

    let resolved = base;
    if (overlay !== undefined) {
      resolved = SuperJson.mergeSecurity(base, overlay);
    }

    return resolved;
  }

  private resolveSecurityConfiguration(
    schemes: SecurityScheme[],
    values: SecurityValues[]
  ): SecurityConfiguration[] {
    const result: SecurityConfiguration[] = [];

    for (const vals of values) {
      const scheme = schemes.find(scheme => scheme.id === vals.id);
      if (scheme === undefined) {
        throw new Error(
          `Could not find scheme for security requirement "${vals.id}"`
        );
      }

      if (scheme.type === SecurityType.APIKEY) {
        if (!isApiKeySecurityValues(vals)) {
          throw new Error(
            `Invalid security values for given apikey scheme "${scheme.id}"`
          );
        }

        result.push({
          ...scheme,
          ...vals,
        });
      } else {
        switch (scheme.scheme) {
          case HttpScheme.BASIC:
            if (!isBasicAuthSecurityValues(vals)) {
              throw new Error(
                `Invalid security values for given basic auth scheme "${scheme.id}"`
              );
            }

            result.push({
              ...scheme,
              ...vals,
            });
            break;

          case HttpScheme.BEARER:
            if (!isBearerTokenSecurityValues(vals)) {
              throw new Error(
                `Invalid security values for given bearer token scheme "${scheme.id}"`
              );
            }

            result.push({
              ...scheme,
              ...vals,
            });
            break;

          case HttpScheme.DIGEST:
            if (!isDigestSecurityValues(vals)) {
              throw new Error(
                `Invalid security values for given digest scheme "${scheme.id}"`
              );
            }

            result.push({
              ...scheme,
              ...vals,
            });
            break;
        }
      }
    }

    return result;
  }
}
