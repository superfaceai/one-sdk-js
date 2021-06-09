import { MapDocumentNode, ProfileDocumentNode } from '@superfaceai/ast';
import createDebug from 'debug';
import { promises as fsp } from 'fs';
import { join as joinPath } from 'path';

import {
  HttpScheme,
  ProviderJson,
  SecurityScheme,
  SecurityType,
} from '../internal';
import { SDKExecutionError } from '../internal/errors';
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
} from '../internal/superjson';
import { err, ok, Result } from '../lib';
import { CrossFetch } from '../lib/fetch';
import { ProfileConfiguration } from './profile';
import { ProviderConfiguration } from './provider';
import { fetchBind } from './registry';

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
  private profileValidator: ProfileParameterValidator;
  private fetchInstance: FetchInstance;

  constructor(
    private readonly profileAst: ProfileDocumentNode,
    private readonly mapAst: MapDocumentNode,
    private readonly configuration: {
      baseUrl?: string;
      profileProviderSettings?: NormalizedProfileProviderSettings;
      security: SecurityConfiguration[];
    }
  ) {
    this.profileValidator = new ProfileParameterValidator(this.profileAst);
    this.fetchInstance = new CrossFetch();
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
    Reflect.set(this.fetchInstance, 'metadata', {
      profile: profileAstId(this.profileAst),
      usecase,
    });
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
      },
      { fetchInstance: this.fetchInstance }
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
}

export type BindConfiguration = {
  serviceId?: string;
  security?: SecurityValues[];
  registryUrl?: string;
};

const profileProviderDebug = createDebug('superface:profile-provider');
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
      let profileId;
      if (this.profile instanceof ProfileConfiguration) {
        profileId = this.profile.id;
      } else if (typeof this.profile === 'string') {
        profileId = this.profile;
      } else {
        profileId = profileAstId(this.profile);
      }

      throw new SDKExecutionError(
        `Invalid profile "${profileId}"`,
        [],
        [
          `Check that the profile is installed in super.json -> profiles or that the url is valid`,
          `Profiles can be installed using the superface cli tool: \`superface install --help\` for more info`,
        ]
      );
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
    // BUG: The serviceId coming from this.provider when it is ProviderConfiguration is not respected
    const serviceId = configuration?.serviceId ?? providerInfo.defaultService;
    const baseUrl = providerInfo.services.find(s => s.id === serviceId)
      ?.baseUrl;
    if (baseUrl === undefined) {
      let hints: string[] = [];
      if (serviceId == providerInfo.defaultService) {
        hints = [
          'This appears to be an error in the provider definition. Make sure that the defaultService in provider definition refers to an existing service id',
        ];
      }
      // TODO: The service url resolution will change soon, probably won't be externally configurable

      throw new SDKExecutionError(
        `Service not found: ${serviceId}`,
        [`Service "${serviceId}" for provider "${providerName}" was not found`],
        hints
      );
    }

    const securityConfiguration = this.resolveSecurityConfiguration(
      providerInfo.securitySchemes ?? [],
      securityValues,
      providerName
    );

    return new BoundProfileProvider(profileAst, mapAst, {
      baseUrl,
      profileProviderSettings: this.superJson.normalized.profiles[profileId]
        ?.providers[providerInfo.name],
      security: securityConfiguration,
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
    values: SecurityValues[],
    providerName: string
  ): SecurityConfiguration[] {
    const result: SecurityConfiguration[] = [];

    for (const vals of values) {
      const scheme = schemes.find(scheme => scheme.id === vals.id);
      if (scheme === undefined) {
        const definedSchemes = schemes.map(s => s.id).join(', ');
        throw new SDKExecutionError(
          `Could not find security scheme for security value with id "${vals.id}"`,
          [
            `The provider definition for "${providerName}" defines ` +
              (definedSchemes.length > 0
                ? `these security schemes: ${definedSchemes}`
                : 'no security schemes'),
            `but a secret value was provided for security scheme: ${vals.id}`,
          ],
          [
            `Check that every entry id in super.json -> providers["${providerName}"].security refers to an existing security scheme`,
            `Make sure any configuration overrides in code for provider "${providerName}" refer to an existing security scheme`,
          ]
        );
      }

      const invalidSchemeValuesErrorBuilder = (
        scheme: SecurityScheme,
        values: SecurityValues,
        requiredKeys: [string, ...string[]]
      ) => {
        const valueKeys = Object.keys(values)
          .filter(k => k !== 'id')
          .join(', ');
        const reqKeys = requiredKeys.join(', ');

        return new SDKExecutionError(
          `Invalid security values for given ${scheme.type} scheme: ${scheme.id}`,
          [
            `The provided security values with id "${scheme.id}" have keys: ${valueKeys}`,
            `but ${scheme.type} scheme requires: ${reqKeys}`,
          ],
          [
            `Check that the entry with id "${scheme.id}" in super.json -> providers["${providerName}"].security refers to the correct security scheme`,
            `Make sure any configuration overrides in code for provider "${providerName}" refer to the correct security scheme`,
          ]
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
              throw invalidSchemeValuesErrorBuilder(scheme, vals, ['digest']);
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
