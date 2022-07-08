import {
  assertProfileDocumentNode,
  EXTENSIONS,
  ProfileDocumentNode,
} from '@superfaceai/ast';

import { profileAstId, SuperCache } from '../../lib';
import { SuperJson } from '../../schema-tools';
import { Config } from '../config';
import {
  NotFoundError,
  profileFileNotFoundError,
  profileNotFoundError,
  profileNotInstalledError,
  sourceFileExtensionFoundError,
  unconfiguredProviderInPriorityError,
  unsupportedFileExtensionError,
} from '../errors';
import { Events, Interceptable } from '../events';
import { ICrypto, IFileSystem, ILogger, ITimers } from '../interfaces';
import { AuthCache, IFetch } from '../interpreter';
import { Profile, ProfileConfiguration } from '../profile';
import { IBoundProfileProvider } from '../profile-provider';
import { fetchProfileAst } from '../registry';

const DEBUG_NAMESPACE = 'client';

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
    private readonly fetchInstance: IFetch & Interceptable & AuthCache,
    private readonly logger?: ILogger
  ) {}

  /**
   * Resolves profile AST file.
   * File property:
   *  - loads directly passed file
   *  - can point only to .supr.ast.json file
   *  - throws if file not found or not valid ProfileDocumentNode
   * Version property:
   *  - looks for [profileId]@[version].supr.ast.json file in superface/grid
   *  - if not found it tries to fetch profile AST from Registry
   * @returns ProfileDocumentNode
   */
  public async resolveProfileAst(
    profileId: string
  ): Promise<ProfileDocumentNode> {
    const logFunction = this.logger?.log(DEBUG_NAMESPACE);

    const loadProfileAstFile = async (
      fileNameWithExtension: string
    ): Promise<ProfileDocumentNode> => {
      const contents = await this.fileSystem.readFile(fileNameWithExtension);
      if (contents.isErr()) {
        if (contents.error instanceof NotFoundError) {
          throw profileFileNotFoundError(fileNameWithExtension, profileId);
        }
        throw contents.error;
      }

      return assertProfileDocumentNode(JSON.parse(contents.value));
    };

    const profileSettings = this.superJson.normalized.profiles[profileId];

    if (profileSettings === undefined) {
      throw profileNotFoundError(profileId);
    }
    let filepath: string;
    if ('file' in profileSettings) {
      filepath = this.superJson.resolvePath(profileSettings.file);
      logFunction?.('Reading possible profile file: %S', filepath);
      // check extensions
      if (filepath.endsWith(EXTENSIONS.profile.source)) {
        // FIX:  SDKExecutionError is used to ensure correct formatting. Improve formatting of UnexpectedError
        throw sourceFileExtensionFoundError(EXTENSIONS.profile.source);
      } else if (!filepath.endsWith(EXTENSIONS.profile.build)) {
        // FIX:  SDKExecutionError is used to ensure correct formatting. Improve formatting of UnexpectedError
        throw unsupportedFileExtensionError(filepath, EXTENSIONS.profile.build);
      }

      return await loadProfileAstFile(filepath);
    }
    // assumed to be in grid folder
    // TODO: look in other place (.cache) use config.cachePath?
    // FIX: super.json path - when we use in code super.json it is resolving path incorrectly
    filepath = this.superJson.resolvePath(
      this.fileSystem.path.join(
        'grid',
        `${profileId}@${profileSettings.version}`
      )
    );

    logFunction?.('Reading possible profile file: %S', filepath);
    try {
      // TODO: cache this somewhere (in memory)?
      return await loadProfileAstFile(filepath + EXTENSIONS.profile.build);
    } catch (error) {
      logFunction?.(
        'Reading of possible profile file failed with error %O',
        error
      );
      void error;
    }

    logFunction?.('Fetching profile file from registry');

    // Fallback to remote
    // TODO: cache this somewhere (similar to CLI - .cache, config.cachePath, in memory)?
    return fetchProfileAst(
      `${profileId}@${profileSettings.version}`,
      this.config,
      this.crypto,
      this.fetchInstance,
      this.logger
    );
  }

  public async getProfile(profileId: string): Promise<Profile> {
    const ast = await this.resolveProfileAst(profileId);
    const profileConfiguration = await this.getProfileConfiguration(ast);

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
    ast: ProfileDocumentNode
  ): Promise<ProfileConfiguration> {
    const profileId = profileAstId(ast);
    const profileSettings = this.superJson.normalized.profiles[profileId];
    if (profileSettings === undefined) {
      throw profileNotInstalledError(profileId);
    }

    // TODO: use/create some util?
    let version = `${ast.header.version.major}.${ast.header.version.minor}.${ast.header.version.patch}`;

    if (ast.header.version.label !== undefined) {
      version += `-${ast.header.version.label}`;
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
