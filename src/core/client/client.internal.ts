import { ProfileDocumentNode } from '@superfaceai/ast';

import { SuperCache } from '../../lib';
import { SuperJson } from '../../schema-tools';
import { Config } from '../config';
import {
  profileFileNotFoundError,
  profileNotInstalledError,
  unconfiguredProviderInPriorityError,
} from '../errors';
import { Events, Interceptable } from '../events';
import { ICrypto, IFileSystem, ILogger, ITimers } from '../interfaces';
import { AuthCache, FetchInstance } from '../interpreter';
import { Parser } from '../parser';
import { Profile, ProfileConfiguration } from '../profile';
import { IBoundProfileProvider } from '../profile-provider';
import { fetchProfileSource } from '../registry';

export class InternalClient {
  constructor(
    private readonly events: Events,
    private readonly superJson: SuperJson,
    private readonly config: Config,
    private readonly timers: ITimers,
    private readonly fileSystem: IFileSystem,
    private readonly boundProfileProviderCache: SuperCache<{
      provider: IBoundProfileProvider;
      expiresAt: number;
    }>,
    private readonly crypto: ICrypto,
    private readonly fetchInstance: FetchInstance & Interceptable & AuthCache,
    private readonly logger?: ILogger
  ) {}

  // TODO: Move to SuperfaceClientBase?
  // TODO: Fetch AST directly?
  // TODO: Fallback to the grid?
  // TODO: Try to load it from cache?
  public async resolveProfileAst(
    profileConfiguration: ProfileConfiguration
  ): Promise<ProfileDocumentNode> {
    let scope: string | undefined;
    let profileName: string;
    const [scopeOrProfileName, resolvedProfileName] =
      profileConfiguration.id.split('/');

    if (resolvedProfileName === undefined) {
      profileName = scopeOrProfileName;
    } else {
      profileName = resolvedProfileName;
      scope = scopeOrProfileName;
    }

    const profileSettings =
      this.superJson.normalized.profiles[profileConfiguration.id];
    if (profileSettings !== undefined) {
      let filepath: string;
      if ('file' in profileSettings) {
        // assumed right next to source file
        filepath = this.superJson.resolvePath(profileSettings.file);
      } else {
        // assumed to be in grid folder
        filepath = this.superJson.resolvePath(
          this.fileSystem.path.join(
            'grid',
            `${profileConfiguration.id}@${profileSettings.version}.supr`
          )
        );
      }

      let contents, fileNameWithExtension;
      const extensions = ['.ast.json', ''];
      for (const extension of extensions) {
        fileNameWithExtension = filepath + extension;
        contents = await this.fileSystem.readFile(fileNameWithExtension);
        break;
      }
      if (contents !== undefined && contents.isOk()) {
        return Parser.parseProfile(
          contents.value,
          filepath,
          {
            profileName,
            scope,
          },
          this.config.cachePath,
          this.fileSystem
        );
      }
    }
    // Fallback to remote
    const profileSource = await fetchProfileSource(
      `${profileConfiguration.id}@${profileConfiguration.version}`,
      this.config,
      this.crypto,
      this.fetchInstance,
      this.logger
    );

    return Parser.parseProfile(
      profileSource,
      profileConfiguration.id,
      {
        profileName,
        scope,
      },
      this.config.cachePath,
      this.fileSystem
    );
  }

  public async getProfile(profileId: string): Promise<Profile> {
    const profileConfiguration = await this.getProfileConfiguration(profileId);
    const ast = await this.resolveProfileAst(profileConfiguration);

    return new Profile(
      profileConfiguration,
      ast,
      this.events,
      this.superJson,
      this.config,
      this.timers,
      this.fileSystem,
      this.boundProfileProviderCache,
      this.crypto,
      this.fetchInstance,
      this.logger
    );
  }

  public async getProfileConfiguration(
    profileId: string
  ): Promise<ProfileConfiguration> {
    const profileSettings = this.superJson.normalized.profiles[profileId];
    if (profileSettings === undefined) {
      throw profileNotInstalledError(profileId);
    }

    let version;
    if ('file' in profileSettings) {
      const filePath = this.superJson.resolvePath(profileSettings.file);
      if (!(await this.fileSystem.exists(filePath))) {
        throw profileFileNotFoundError(profileSettings.file, profileId);
      }

      // TODO: read version from the ast?
      version = 'unknown';
    } else {
      version = profileSettings.version;
    }

    // TODO: load priority and add it to ProfileConfiguration?
    const priority = profileSettings.priority;
    if (!priority.every(p => this.superJson.normalized.providers[p])) {
      throw unconfiguredProviderInPriorityError(
        profileId,
        priority,
        Object.keys(this.superJson.normalized.providers)
      );
    }

    return new ProfileConfiguration(profileId, version);
  }
}
