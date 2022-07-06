import {
  EXTENSIONS,
  isProfileDocumentNode,
  ProfileDocumentNode,
} from '@superfaceai/ast';

import { Result, SuperCache } from '../../lib';
import { SuperJson } from '../../schema-tools';
import { Config } from '../config';
import {
  FileSystemError,
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
import { fetchProfileAst } from '../registry';

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
  ) { }

  /**
   * Resolves profile AST file.
   *
   * @param profileConfiguration
   * @returns
   */
  // TODO: Move to SuperfaceClientBase?
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

    // TODO: move to utils?
    // TODO: handle cases when extension is part of filepath
    const loadProfileAst = async (
      filepath: string
    ): Promise<ProfileDocumentNode | undefined> => {
      let contents: Result<string, FileSystemError>;
      const fileNameWithExtension = filepath + EXTENSIONS.profile.build;

      contents = await this.fileSystem.readFile(fileNameWithExtension);
      console.log('ast con', contents)

      if (contents.isOk()) {
        const possibleProfileAst: unknown = JSON.parse(contents.value);
        if (isProfileDocumentNode(possibleProfileAst)) {
          return possibleProfileAst;
        }
      }
      console.log('source con', contents)

      contents = await this.fileSystem.readFile(fileNameWithExtension);
      if (contents.isOk()) {
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

      return;
    };

    const profileSettings =
      this.superJson.normalized.profiles[profileConfiguration.id];
    if (profileSettings !== undefined) {
      let filepath: string;
      if ('file' in profileSettings) {
        // assumed right next to source file
        // FIX: super.json path - when we use in code super.json it is resolving path incorrectly
        filepath = this.superJson.resolvePath(profileSettings.file);
      } else {
        // assumed to be in grid folder
        // TODO: look in other place (.cache) use config.cachePath?
        // FIX: super.json path - when we use in code super.json it is resolving path incorrectly
        filepath = this.superJson.resolvePath(
          this.fileSystem.path.join(
            'grid',
            `${profileConfiguration.id}@${profileSettings.version}`
          )
        );
      }

      console.log('file path', filepath)

      const ast = await loadProfileAst(filepath);

      if (ast !== undefined) {
        return ast;
      }
      // if this logic path fails whole method should fail - do not fallback to remote
      if ('file' in profileSettings) {
        throw new Error('TODO unable to find profile file');
      }
    }

    // Fallback to remote
    // TODO: cache this somewhere (similar to CLI - .cache, config.cachePath)?
    return fetchProfileAst(
      `${profileConfiguration.id}@${profileConfiguration.version}`,
      this.config,
      this.crypto,
      this.fetchInstance,
      this.logger
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
      console.log('ex path', filePath)
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
