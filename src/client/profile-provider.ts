import {
  assertMapDocumentNode,
  assertProfileDocumentNode,
  FILE_URI_PROTOCOL,
  HttpScheme,
  isApiKeySecurityValues,
  isBasicAuthSecurityValues,
  isBearerTokenSecurityValues,
  isDigestSecurityValues,
  isFileURIString,
  isMapFile,
  isProfileASTFile,
  isProfileFile,
  MapDocumentNode,
  NormalizedProfileProviderSettings,
  prepareProviderParameters,
  ProfileDocumentNode,
  ProviderJson,
  SecurityScheme,
  SecurityType,
  SecurityValues,
} from '@superfaceai/ast';
import createDebug from 'debug';
import { promises as fsp } from 'fs';
import { join as joinPath } from 'path';

import {
  invalidProfileError,
  invalidSecurityValuesError,
  localProviderAndRemoteMapError,
  parserNotFoundError,
  providersDoNotMatchError,
  referencedFileNotFoundError,
  securityNotFoundError,
  serviceNotFoundError,
} from '../internal/errors.helpers';
import {
  MapInterpreter,
  MapInterpreterError,
  ProfileParameterError,
  ProfileParameterValidator,
} from '../internal/interpreter';
import { FetchInstance } from '../internal/interpreter/http/interfaces';
import { SecurityConfiguration } from '../internal/interpreter/http/security';
import {
  castToNonPrimitive,
  mergeVariables,
  NonPrimitive,
} from '../internal/interpreter/variables';
import { Parser } from '../internal/parser';
import { SuperJson } from '../internal/superjson';
import { mergeSecurity } from '../internal/superjson/mutate';
import { err, ok, Result } from '../lib';
import { Events, Interceptable } from '../lib/events';
import { CrossFetch } from '../lib/fetch';
import { MapInterpreterEventAdapter } from './failure/map-interpreter-adapter';
import { ProfileConfiguration } from './profile';
import { ProviderConfiguration } from './provider';
import { fetchBind, fetchMapSource, fetchProviderInfo } from './registry';

function forceCast<T>(_: unknown): asserts _ is T {}

function profileAstId(ast: ProfileDocumentNode): string {
  return ast.header.scope !== undefined
    ? ast.header.scope + '/' + ast.header.name
    : ast.header.name;
}

const boundProfileProviderDebug = createDebug(
  'superface:bound-profile-provider'
);

export class BoundProfileProvider {
  // TODO: Interceptable and set metadata
  private profileValidator: ProfileParameterValidator;
  private fetchInstance: FetchInstance & Interceptable;

  constructor(
    private readonly profileAst: ProfileDocumentNode,
    private readonly mapAst: MapDocumentNode,
    private readonly providerName: string,
    readonly configuration: {
      baseUrl: string;
      profileProviderSettings?: NormalizedProfileProviderSettings;
      security: SecurityConfiguration[];
      parameters?: Record<string, string>;
    },
    events?: Events
  ) {
    this.profileValidator = new ProfileParameterValidator(this.profileAst);

    this.fetchInstance = new CrossFetch();
    this.fetchInstance.metadata = {
      profile: profileAstId(profileAst),
      provider: providerName,
    };
    this.fetchInstance.events = events;
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
    input?: TInput,
    parameters?: Record<string, string>
  ): Promise<Result<TResult, ProfileParameterError | MapInterpreterError>> {
    this.fetchInstance.metadata = {
      profile: profileAstId(this.profileAst),
      usecase,
      provider: this.providerName,
    };
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
    const interpreter = new MapInterpreter<TInput>(
      {
        input: composedInput,
        usecase,
        serviceBaseUrl: this.configuration.baseUrl,
        security: this.configuration.security,
        parameters: this.mergeParameters(
          parameters,
          this.configuration.parameters
        ),
      },
      {
        fetchInstance: this.fetchInstance,
        externalHandler: new MapInterpreterEventAdapter(
          this.fetchInstance.metadata,
          this.fetchInstance.events
        ),
      }
    );

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

  private mergeParameters(
    parameters?: Record<string, string>,
    providerParameters?: Record<string, string>
  ): Record<string, string> | undefined {
    if (parameters === undefined) {
      return providerParameters;
    }

    if (providerParameters === undefined) {
      return parameters;
    }

    return {
      ...providerParameters,
      ...parameters,
    };
  }
}

export type BindConfiguration = {
  security?: SecurityValues[];
};

const profileProviderDebug = createDebug('superface:profile-provider');

export class ProfileProvider {
  private profileId: string;
  private scope: string | undefined;
  private profileName: string;

  constructor(
    /** Preloaded superJson instance */
    //TODO: Use superJson from events/Client?
    public readonly superJson: SuperJson,
    /** profile id, url, ast node or configuration instance */
    private profile: string | ProfileDocumentNode | ProfileConfiguration,
    /** provider name, url or configuration instance */
    private provider: string | ProviderJson | ProviderConfiguration,
    private events: Events,
    /** url or ast node */
    private map?: string | MapDocumentNode
  ) {
    if (this.profile instanceof ProfileConfiguration) {
      this.profileId = this.profile.id;
    } else if (typeof this.profile === 'string') {
      this.profileId = this.profile;
    } else {
      this.profileId = profileAstId(this.profile);
    }
    const [scopeOrProfileName, profileName] = this.profileId.split('/');
    if (profileName === undefined) {
      this.profileName = scopeOrProfileName;
    } else {
      this.scope = scopeOrProfileName;
      this.profileName = profileName;
    }
  }

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
      throw invalidProfileError(this.profileId);
    }
    const profileId = profileAstId(profileAst);

    // resolve provider from parameters or defer until later
    const resolvedProviderInfo = await this.resolveProviderInfo();
    let providerInfo = resolvedProviderInfo.providerInfo;
    const providerName = resolvedProviderInfo.providerName;
    const securityValues = this.resolveSecurityValues(
      providerName,
      configuration?.security
    );

    const thisProviderName =
      typeof this.provider === 'string' ? this.provider : this.provider.name;

    if (providerName !== thisProviderName) {
      throw providersDoNotMatchError(
        providerName,
        thisProviderName,
        'provider.json'
      );
    }

    // resolve map from parameters or defer until later
    const resolvedMapAst = await this.resolveMapAst(
      `${profileId}.${providerName}`
    );
    let mapAst = resolvedMapAst.mapAst;
    const mapVariant = resolvedMapAst.mapVariant;
    const mapRevision = resolvedMapAst.mapRevision;

    // resolve map ast using bind and fill in provider info if not specified
    if (mapAst === undefined) {
      profileProviderDebug('Fetching map from store');
      //throw error when we have remote map and local provider
      if (providerInfo) {
        throw localProviderAndRemoteMapError(providerName, this.profileId);
      }
      const fetchResponse = await fetchBind({
        profileId:
          profileId +
          `@${profileAst.header.version.major}.${profileAst.header.version.minor}.${profileAst.header.version.patch}`,
        provider: providerName,
        mapVariant,
        mapRevision,
      });

      providerInfo ??= fetchResponse.provider;
      mapAst = fetchResponse.mapAst;
      //If we don't have a map (probably due to validation issue) we try to get map source and parse it on our own
      if (!mapAst) {
        const version = `${profileAst.header.version.major}.${profileAst.header.version.minor}.${profileAst.header.version.patch}`;
        const mapId = mapVariant
          ? `${profileId}.${providerName}.${mapVariant}@${version}`
          : `${profileId}.${providerName}@${version}`;
        const mapSource = await fetchMapSource(mapId);

        mapAst = await Parser.parseMap(mapSource, mapId, {
          profileName: profileAst.header.name,
          scope: profileAst.header.scope,
          providerName,
        });

        if (!mapAst) {
          throw parserNotFoundError();
        }
      }
    } else if (providerInfo === undefined) {
      // resolve only provider info if map is specified locally
      providerInfo = await fetchProviderInfo(providerName);
    }

    if (providerName !== mapAst.header.provider) {
      throw providersDoNotMatchError(
        mapAst.header.provider,
        providerName,
        'map'
      );
    }

    // prepare service info
    const serviceId = providerInfo.defaultService;
    const baseUrl = providerInfo.services.find(
      s => s.id === serviceId
    )?.baseUrl;
    if (baseUrl === undefined) {
      throw serviceNotFoundError(
        serviceId,
        providerName,
        serviceId === providerInfo.defaultService
      );
    }

    const securityConfiguration = this.resolveSecurityConfiguration(
      providerInfo.securitySchemes ?? [],
      securityValues,
      providerName
    );

    return new BoundProfileProvider(
      profileAst,
      mapAst,
      providerInfo.name,
      {
        baseUrl,
        profileProviderSettings:
          this.superJson.normalized.profiles[profileId]?.providers[
            providerInfo.name
          ],
        security: securityConfiguration,
        parameters: this.resolveIntegrationParameters(
          providerInfo,
          this.superJson.normalized.providers[providerInfo.name]?.parameters
        ),
      },
      this.events
    );
  }

  private resolveIntegrationParameters(
    providerJson: ProviderJson,
    superJsonParameters?: Record<string, string>
  ): Record<string, string> | undefined {
    if (superJsonParameters === undefined) {
      return undefined;
    }

    const providerJsonParameters = providerJson.parameters || [];
    if (
      Object.keys(superJsonParameters).length !== 0 &&
      providerJsonParameters.length === 0
    ) {
      console.warn(
        'Warning: Super.json defines integration parameters but provider.json does not'
      );
    }
    const result: Record<string, string> = {};

    const preparedParameters = prepareProviderParameters(
      providerJson.name,
      providerJsonParameters
    );

    // Resolve parameters defined in super.json
    for (const [key, value] of Object.entries(superJsonParameters)) {
      const providerJsonParameter = providerJsonParameters.find(
        parameter => parameter.name === key
      );
      // If value name and prepared value equals we are dealing with unset env
      if (
        providerJsonParameter &&
        preparedParameters[providerJsonParameter.name] === value
      ) {
        if (providerJsonParameter.default) {
          result[key] = providerJsonParameter.default;
        }
      }

      // Use original value
      if (!result[key]) {
        result[key] = value;
      }
    }

    // Resolve parameters which are missing in super.json and have default value
    for (const parameter of providerJsonParameters) {
      if (result[parameter.name] === undefined && parameter.default) {
        result[parameter.name] = parameter.default;
      }
    }

    return result;
  }

  private async resolveProfileAst(): Promise<ProfileDocumentNode | undefined> {
    let resolveInput = this.profile;
    if (resolveInput instanceof ProfileConfiguration) {
      resolveInput = resolveInput.id;
    }

    const profileAst = await ProfileProvider.resolveValue(
      resolveInput,
      async (fileContents, fileName) => {
        // If we have profile AST, we return it
        if (fileName !== undefined && isProfileASTFile(fileName)) {
          return assertProfileDocumentNode(JSON.parse(fileContents));
        }

        // If we have profile source, we parse
        if (fileName !== undefined && isProfileFile(fileName)) {
          return Parser.parseProfile(fileContents, fileName, {
            profileName: this.profileName,
            scope: this.scope,
          });
        }

        // Otherwise we return parsed
        return assertProfileDocumentNode(JSON.parse(fileContents));
      },
      profileId => {
        const profileSettings = this.superJson.normalized.profiles[profileId];
        if (profileSettings === undefined) {
          // not found at all
          return undefined;
        } else if ('file' in profileSettings) {
          // assumed right next to source file
          return (
            FILE_URI_PROTOCOL + this.superJson.resolvePath(profileSettings.file)
          );
        } else {
          // assumed to be in grid folder
          return (
            FILE_URI_PROTOCOL +
            this.superJson.resolvePath(
              joinPath('grid', `${profileId}@${profileSettings.version}.supr`)
            )
          );
        }
      },
      ['.ast.json', '']
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
      async fileContents => JSON.parse(fileContents) as ProviderJson, // TODO: validate
      providerName => {
        const providerSettings =
          this.superJson.normalized.providers[providerName];
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

  private async resolveMapAst(mapId: string): Promise<{
    mapAst?: MapDocumentNode;
    mapVariant?: string;
    mapRevision?: string;
  }> {
    const mapInfo: { mapVariant?: string; mapRevision?: string } = {};
    const [, providerName] = mapId.split('.');
    const mapAst = await ProfileProvider.resolveValue<MapDocumentNode>(
      this.map ?? mapId,
      async (fileContents, fileName) => {
        // If we have source, we parse
        if (fileName !== undefined && isMapFile(fileName)) {
          const mapAst = Parser.parseMap(fileContents, fileName, {
            profileName: this.profileName,
            providerName,
            scope: this.scope,
          });

          if (mapAst === undefined) {
            throw parserNotFoundError();
          }
        }

        // Otherwise we return parsed
        return assertMapDocumentNode(JSON.parse(fileContents));
      },
      mapId => {
        const [profileId, providerName] = mapId.split('.');
        const profileProviderSettings =
          this.superJson.normalized.profiles[profileId].providers[providerName];

        if (profileProviderSettings === undefined) {
          return undefined;
        } else if ('file' in profileProviderSettings) {
          return (
            FILE_URI_PROTOCOL +
            this.superJson.resolvePath(profileProviderSettings.file)
          );
        } else {
          mapInfo.mapVariant = profileProviderSettings.mapVariant;
          mapInfo.mapRevision = profileProviderSettings.mapRevision;

          return undefined;
        }
      },
      ['.ast.json', '']
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
    parseFile: (contents: string, fileName?: string) => Promise<T>,
    unpackNested: (input: string) => T | string | undefined,
    extensions: string[] = ['']
  ): Promise<T | undefined> {
    if (typeof input === 'string') {
      if (isFileURIString(input)) {
        const fileName = input.slice(FILE_URI_PROTOCOL.length);
        profileProviderDebug('Resolving input as file:', fileName);

        // read in files
        let contents, fileNameWithExtension;
        for (const extension of extensions) {
          fileNameWithExtension = fileName + extension;
          try {
            contents = await fsp.readFile(fileNameWithExtension, {
              encoding: 'utf-8',
            });
            break;
          } catch (e) {
            void e;
          }
        }

        if (contents === undefined) {
          throw referencedFileNotFoundError(fileName, extensions);
        }

        return parseFile(contents, fileNameWithExtension);
      } else {
        // TODO: detect remote url and fetch it, or call a callback?
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
      resolved = mergeSecurity(base, overlay);
    }

    return resolved;
  }

  private resolveSecurityConfiguration(
    schemes: SecurityScheme[],
    values: SecurityValues[],
    providerName: string
  ): SecurityConfiguration[] {
    const result: SecurityConfiguration[] = [];

    for (const vals of values) {
      const scheme = schemes.find(scheme => scheme.id === vals.id);
      if (scheme === undefined) {
        const definedSchemes = schemes.map(s => s.id);
        throw securityNotFoundError(providerName, definedSchemes, vals);
      }

      const invalidSchemeValuesErrorBuilder = (
        scheme: SecurityScheme,
        values: SecurityValues,
        requiredKeys: [string, ...string[]]
      ) => {
        const valueKeys = Object.keys(values).filter(k => k !== 'id');

        return invalidSecurityValuesError(
          providerName,
          scheme.type,
          scheme.id,
          valueKeys,
          requiredKeys
        );
      };

      if (scheme.type === SecurityType.APIKEY) {
        if (!isApiKeySecurityValues(vals)) {
          throw invalidSchemeValuesErrorBuilder(scheme, vals, ['apikey']);
        }

        result.push({
          ...scheme,
          ...vals,
        });
      } else {
        switch (scheme.scheme) {
          case HttpScheme.BASIC:
            if (!isBasicAuthSecurityValues(vals)) {
              throw invalidSchemeValuesErrorBuilder(scheme, vals, [
                'username',
                'password',
              ]);
            }

            result.push({
              ...scheme,
              ...vals,
            });
            break;

          case HttpScheme.BEARER:
            if (!isBearerTokenSecurityValues(vals)) {
              throw invalidSchemeValuesErrorBuilder(scheme, vals, ['token']);
            }

            result.push({
              ...scheme,
              ...vals,
            });
            break;

          case HttpScheme.DIGEST:
            if (!isDigestSecurityValues(vals)) {
              throw invalidSchemeValuesErrorBuilder(scheme, vals, [
                'username',
                'password',
              ]);
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
