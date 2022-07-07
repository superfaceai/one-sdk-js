import type {
  MapDocumentNode,
  NormalizedSuperJsonDocument,
  ProfileDocumentNode,
  ProviderJson,
  SecurityValues,
} from '@superfaceai/ast';
import {
  assertMapDocumentNode,
  assertProviderJson,
  FILE_URI_PROTOCOL,
  isFileURIString,
  isMapFile,
} from '@superfaceai/ast';

import type {
  IConfig,
  ICrypto,
  IFileSystem,
  ILogger,
  ITimers,
  LogFunction,
} from '../../interfaces';
import { forceCast, profileAstId, UnexpectedError } from '../../lib';
import { mergeSecurity } from '../../schema-tools';
import {
  localProviderAndRemoteMapError,
  providersDoNotMatchError,
  referencedFileNotFoundError,
} from '../errors';
import type { Events, Interceptable } from '../events';
import type { AuthCache, IFetch } from '../interpreter';
import { Parser } from '../parser';
import type { ProviderConfiguration } from '../provider';
import { fetchBind, fetchMapSource, fetchProviderInfo } from '../registry';
import { ServiceSelector } from '../services';
import type { IBoundProfileProvider } from './bound-profile-provider';
import { BoundProfileProvider } from './bound-profile-provider';
import { resolveIntegrationParameters } from './parameters';
import type { ProfileProviderConfiguration } from './profile-provider-configuration';
import { resolveSecurityConfiguration } from './security';

const DEBUG_NAMESPACE = 'profile-provider';

export async function bindProfileProvider(
  profile: ProfileDocumentNode,
  profileProviderConfig: ProfileProviderConfiguration,
  providerConfig: ProviderConfiguration,
  superJson: NormalizedSuperJsonDocument | undefined,
  config: IConfig,
  events: Events,
  timers: ITimers,
  fileSystem: IFileSystem,
  crypto: ICrypto,
  fetchInstance: IFetch & Interceptable & AuthCache,
  logger?: ILogger
): Promise<{ provider: IBoundProfileProvider; expiresAt: number }> {
  const profileProvider = new ProfileProvider(
    superJson,
    profile,
    providerConfig,
    profileProviderConfig,
    config,
    events,
    fileSystem,
    crypto,
    fetchInstance,
    logger
  );
  const boundProfileProvider = await profileProvider.bind();
  const expiresAt =
    Math.floor(timers.now() / 1000) + config.superfaceCacheTimeout;

  return { provider: boundProfileProvider, expiresAt };
}

export type BindConfiguration = {
  security?: SecurityValues[];
};

export class ProfileProvider {
  private profileId: string;
  private scope: string | undefined;
  private profileName: string;
  private providerJson?: ProviderJson;
  private readonly providersCachePath: string;
  private readonly log: LogFunction | undefined;

  constructor(
    /** Preloaded superJson instance */
    // TODO: Use superJson from events/Client?
    public readonly superJson: NormalizedSuperJsonDocument | undefined,
    /** profile ast node */
    private profile: ProfileDocumentNode,
    /** provider configuration instance */
    private providerConfig: ProviderConfiguration,
    private profileProviderConfig: ProfileProviderConfiguration,
    private config: IConfig,
    private events: Events,
    private readonly fileSystem: IFileSystem,
    private readonly crypto: ICrypto,
    private readonly fetchInstance: IFetch & Interceptable & AuthCache,
    private readonly logger?: ILogger,
    /** url or ast node */
    private map?: string | MapDocumentNode
  ) {
    this.profileId = profileAstId(this.profile);
    const [scopeOrProfileName, profileName] = this.profileId.split('/');
    if (profileName === undefined) {
      this.profileName = scopeOrProfileName;
    } else {
      this.scope = scopeOrProfileName;
      this.profileName = profileName;
    }
    this.providersCachePath = fileSystem.path.join(
      config.cachePath,
      'providers'
    );
    this.log = logger?.log(DEBUG_NAMESPACE);
  }

  /**
   * Binds the provider.
   *
   * This fetches the unspecified data (provider information and map ast) from registry.
   */
  public async bind(
    configuration?: BindConfiguration
  ): Promise<BoundProfileProvider> {
    const profileId = profileAstId(this.profile);

    // resolve provider from parameters or defer until later
    const resolvedProviderInfo = await this.resolveProviderInfo();
    let providerInfo = resolvedProviderInfo.providerInfo;
    const providerName = resolvedProviderInfo.providerName;
    const securityValues = this.resolveSecurityValues(
      providerName,
      configuration?.security ?? this.providerConfig.security
    );

    const thisProviderName = this.providerConfig.name;

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
    const mapVariant =
      this.profileProviderConfig.variant ?? resolvedMapAst.mapVariant;
    const mapRevision =
      this.profileProviderConfig.revision ?? resolvedMapAst.mapRevision;

    // resolve map ast using bind and fill in provider info if not specified
    if (mapAst === undefined) {
      this.log?.('Fetching map from store');
      // throw error when we have remote map and local provider
      if (providerInfo) {
        throw localProviderAndRemoteMapError(providerName, this.profileId);
      }
      const fetchResponse = await fetchBind(
        {
          profileId:
            profileId +
            `@${this.profile.header.version.major}.${this.profile.header.version.minor}.${this.profile.header.version.patch}`,
          provider: providerName,
          mapVariant,
          mapRevision,
        },
        this.config,
        this.crypto,
        this.fetchInstance,
        this.logger
      );

      providerInfo ??= fetchResponse.provider;
      await this.writeProviderCache(providerInfo);
      this.providerJson = providerInfo;
      mapAst = fetchResponse.mapAst;
      // If we don't have a map (probably due to validation issue) we try to get map source and parse it on our own
      if (!mapAst) {
        const version = `${this.profile.header.version.major}.${this.profile.header.version.minor}.${this.profile.header.version.patch}`;
        const mapId =
          mapVariant !== undefined
            ? `${profileId}.${providerName}.${mapVariant}@${version}`
            : `${profileId}.${providerName}@${version}`;
        const mapSource = await fetchMapSource(
          mapId,
          this.config,
          this.crypto,
          this.fetchInstance,
          this.logger
        );

        mapAst = await Parser.parseMap(
          mapSource,
          mapId,
          {
            profileName: this.profile.header.name,
            scope: this.profile.header.scope,
            providerName,
          },
          this.config.cachePath,
          this.config.cache,
          this.fileSystem
        );
      }
    } else if (providerInfo === undefined) {
      // resolve only provider info if map is specified locally
      providerInfo = await this.cacheProviderInfo(providerName);
    }

    if (providerName !== mapAst.header.provider) {
      throw providersDoNotMatchError(
        mapAst.header.provider,
        providerName,
        'map'
      );
    }

    const securityConfiguration = resolveSecurityConfiguration(
      providerInfo.securitySchemes ?? [],
      securityValues,
      providerName
    );

    return new BoundProfileProvider(
      this.profile,
      mapAst,
      providerInfo,
      this.config,
      {
        services: new ServiceSelector(
          providerInfo.services,
          providerInfo.defaultService
        ),
        profileProviderSettings:
          this.superJson?.profiles[profileId]?.providers[providerInfo.name],
        security: securityConfiguration,
        parameters: resolveIntegrationParameters(
          providerInfo,
          this.providerConfig.parameters ??
            this.superJson?.providers[providerInfo.name]?.parameters
        ),
      },
      this.crypto,
      this.fetchInstance,
      this.logger,
      this.events
    );
  }

  private async cacheProviderInfo(providerName: string): Promise<ProviderJson> {
    const errors: Error[] = [];
    if (this.providerJson === undefined) {
      const providerCachePath = this.fileSystem.path.join(
        this.providersCachePath,
        providerName
      );
      // If we don't have provider info, we first try to fetch it from the registry
      try {
        this.providerJson = await fetchProviderInfo(
          providerName,
          this.config,
          this.crypto,
          this.fetchInstance,
          this.logger
        );
        await this.writeProviderCache(this.providerJson);
      } catch (error) {
        this.log?.(
          `Failed to fetch provider.json for ${providerName}: %O`,
          error
        );
        errors.push(error);
      }

      // If we can't fetch provider info from registry, we try to read it from cache
      if (this.providerJson === undefined) {
        const providerJsonFile = await this.fileSystem.readFile(
          providerCachePath
        );
        if (providerJsonFile.isErr()) {
          this.log?.(
            `Failed to read cached provider.json for ${providerName}`,
            providerJsonFile.error
          );
          errors.push(providerJsonFile.error);
        } else {
          this.providerJson = assertProviderJson(
            JSON.parse(providerJsonFile.value)
          );
        }
      }
    }

    if (this.providerJson === undefined) {
      throw new UnexpectedError(
        'Failed to fetch provider.json or load it from cache.',
        errors
      );
    }

    return this.providerJson;
  }

  private async writeProviderCache(providerJson: ProviderJson): Promise<void> {
    const providerCachePath = this.fileSystem.path.join(
      this.providersCachePath,
      `${providerJson.name}.json`
    );
    if (this.config.cache === true) {
      try {
        await this.fileSystem.mkdir(this.providersCachePath, {
          recursive: true,
        });
        await this.fileSystem.writeFile(
          providerCachePath,
          JSON.stringify(providerJson, undefined, 2)
        );
      } catch (error) {
        this.log?.(
          `Failed to cache provider.json for ${providerJson.name}: %O`,
          error
        );
      }
    }
  }

  private async resolveProviderInfo(): Promise<{
    providerInfo?: ProviderJson;
    providerName: string;
  }> {
    const resolveInput = this.providerConfig.name;

    const providerInfo = await ProfileProvider.resolveValue<ProviderJson>(
      resolveInput,
      async fileContents => JSON.parse(fileContents) as ProviderJson, // TODO: validate
      providerName => {
        if (this.superJson === undefined) {
          return undefined;
        }

        const providerSettings = this.superJson.providers[providerName];
        if (providerSettings?.file !== undefined) {
          // local file is resolved
          return (
            FILE_URI_PROTOCOL +
            this.fileSystem.path.resolve(
              this.config.superfacePath,
              providerSettings.file
            )
          );
        } else {
          // local file not specified
          return undefined;
        }
      },
      this.fileSystem
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
          return Parser.parseMap(
            fileContents,
            fileName,
            {
              profileName: this.profileName,
              providerName,
              scope: this.scope,
            },
            this.config.cachePath,
            this.config.cache,
            this.fileSystem
          );
        }

        // Otherwise we return parsed
        return assertMapDocumentNode(JSON.parse(fileContents));
      },
      mapId => {
        const [profileId, providerName] = mapId.split('.');

        if (this.superJson === undefined) {
          return undefined;
        }
        const profileProviderSettings =
          this.superJson.profiles[profileId].providers[providerName];

        if (profileProviderSettings === undefined) {
          return undefined;
        } else if ('file' in profileProviderSettings) {
          return (
            FILE_URI_PROTOCOL +
            this.fileSystem.path.resolve(
              this.config.superfacePath,
              profileProviderSettings.file
            )
          );
        } else {
          mapInfo.mapVariant = profileProviderSettings.mapVariant;
          mapInfo.mapRevision = profileProviderSettings.mapRevision;

          return undefined;
        }
      },
      this.fileSystem,
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
    fileSystem: IFileSystem,
    extensions: string[] = [''],
    log?: LogFunction
  ): Promise<T | undefined> {
    if (typeof input === 'string') {
      if (isFileURIString(input)) {
        const fileName = input.slice(FILE_URI_PROTOCOL.length);
        log?.('Resolving input as file:', fileName);

        // read in files
        let contents, fileNameWithExtension;
        for (const extension of extensions) {
          fileNameWithExtension = fileName + extension;
          contents = await fileSystem.readFile(fileNameWithExtension);
          if (contents.isOk()) {
            break;
          }
        }

        if (contents === undefined || contents.isErr()) {
          throw referencedFileNotFoundError(fileName, extensions);
        }

        return parseFile(contents.value, fileNameWithExtension);
      } else {
        // TODO: detect remote url and fetch it, or call a callback?
        log?.('Resolving input as nested value: %O', input);
        // unpack nested and recursively process them
        const nested = unpackNested(input);

        return ProfileProvider.resolveValue(
          nested,
          parseFile,
          unpackNested,
          fileSystem,
          extensions
        );
      }
    } else {
      // return undefined and T
      return input;
    }
  }

  /**
   * Resolves auth variables by applying the provided overlay over the base variables.
   *
   * The base variables come from super.json
   */
  private resolveSecurityValues(
    providerName: string,
    overlay?: SecurityValues[]
  ): SecurityValues[] {
    const base: SecurityValues[] =
      this.superJson?.providers[providerName]?.security ?? [];

    if (overlay !== undefined) {
      return mergeSecurity(base, overlay);
    }

    return base;
  }
}
