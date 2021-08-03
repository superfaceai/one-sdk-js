import {
  assertMapDocumentNode,
  assertProfileDocumentNode,
  isMapFile,
  isProfileFile,
  MapDocumentNode,
  ProfileDocumentNode,
} from '@superfaceai/ast';
import createDebug from 'debug';
import { promises as fsp } from 'fs';
import { join as joinPath } from 'path';

import {
  HttpScheme,
  ProviderJson,
  SecurityScheme,
  SecurityType,
} from '../internal';
import { UnexpectedError } from '../internal/errors';
import {
  invalidProfileError,
  invalidSecurityValuesError,
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
import { mergeSecurity } from '../internal/superjson/mutate';
import { err, ok, Result } from '../lib';
import { Events, Interceptable } from '../lib/events';
import { CrossFetch } from '../lib/fetch';
import { MapInterpreterEventAdapter } from './failure/map-interpreter-adapter';
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
  //TODO: Interceptable and set metadata
  private profileValidator: ProfileParameterValidator;
  private fetchInstance: FetchInstance & Interceptable;

  constructor(
    private readonly profileAst: ProfileDocumentNode,
    private readonly mapAst: MapDocumentNode,
    private readonly providerName: string,
    private readonly configuration: {
      baseUrl?: string;
      profileProviderSettings?: NormalizedProfileProviderSettings;
      security: SecurityConfiguration[];
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
    input?: TInput
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
}

export type BindConfiguration = {
  serviceId?: string;
  security?: SecurityValues[];
  registryUrl?: string;
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
      throw new UnexpectedError(
        'NOT IMPLEMENTED: map provided locally but provider is not'
      );
    }

    // prepare service info
    // BUG: The serviceId coming from this.provider when it is ProviderConfiguration is not respected
    const serviceId = configuration?.serviceId ?? providerInfo.defaultService;
    const baseUrl = providerInfo.services.find(
      s => s.id === serviceId
    )?.baseUrl;
    if (baseUrl === undefined) {
      // TODO: The service url resolution will change soon, probably won't be externally configurable
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
      },
      this.events
    );
  }

  private async resolveProfileAst(): Promise<ProfileDocumentNode | undefined> {
    let resolveInput = this.profile;
    if (resolveInput instanceof ProfileConfiguration) {
      resolveInput = resolveInput.id;
    }

    const profileAst = await ProfileProvider.resolveValue(
      resolveInput,
      async (fileContents, fileName) => {
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
          return Parser.parseMap(fileContents, fileName, {
            profileName: this.profileName,
            providerName,
            scope: this.scope,
          });
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
