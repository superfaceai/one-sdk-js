import type {
  NormalizedSuperJsonDocument,
  ProfileDocumentNode,
  ProviderJson,
  SecurityValues,
} from '@superfaceai/ast';
import { assertProviderJson } from '@superfaceai/ast';

import type {
  IConfig,
  ICrypto,
  IFileSystem,
  ILogger,
  ITimers,
  LogFunction,
} from '../../interfaces';
import { profileAstId } from '../../lib';
import { mergeSecurity } from '../../schema-tools';
import {
  invalidMapASTResponseError,
  localProviderAndRemoteMapError,
  providersDoNotMatchError,
  UnexpectedError,
} from '../errors';
import type { Events, Interceptable } from '../events';
import type { AuthCache, IFetch } from '../interpreter';
import type { ProviderConfiguration } from '../provider';
import { resolveProviderJson } from '../provider';
import { fetchBind, fetchProviderInfo } from '../registry';
import { ServiceSelector } from '../services';
import type { IBoundProfileProvider } from './bound-profile-provider';
import { BoundProfileProvider } from './bound-profile-provider';
import { resolveIntegrationParameters } from './parameters';
import type { ProfileProviderConfiguration } from './profile-provider-configuration';
import { resolveMapAst } from './resolve-map-ast';
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
  private providerJson?: ProviderJson;
  private readonly providersCachePath: string;
  private readonly log: LogFunction | undefined;

  constructor(
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
    private readonly logger?: ILogger
  ) {
    this.profileId = profileAstId(this.profile);
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
    const providerName = this.providerConfig.name;
    let providerInfo = await resolveProviderJson({
      providerName: this.providerConfig.name,
      superJson: this.superJson,
      fileSystem: this.fileSystem,
      config: this.config,
      logger: this.logger,
    });
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
    let mapAst = await resolveMapAst({
      profileId,
      providerName,
      variant: this.profileProviderConfig.variant,
      superJson: this.superJson,
      fileSystem: this.fileSystem,
      config: this.config,
      logger: this.logger,
    });

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
          mapVariant: this.profileProviderConfig.variant,
          mapRevision: this.profileProviderConfig.revision,
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
      if (!mapAst) {
        throw invalidMapASTResponseError();
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
        errors.push(error as Error);
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
