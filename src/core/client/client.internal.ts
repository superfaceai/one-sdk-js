import {
  assertProfileDocumentNode,
  EXTENSIONS,
  ProfileDocumentNode,
} from '@superfaceai/ast';

import { profileAstId, SuperCache } from '../../lib';
import { SuperJson } from '../../schema-tools';
import { Config } from '../config';
import {
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
  ) {}

  /**
   * Resolves profile AST file.
   * File property:
   *  - loads directly passed file
   *  - can point to .supr or .supr.ast.json file
   *  - throws if file not found
   * Version property
   *  - looks for [profileId]@[version].supr.ast.json file in superface/grid
   *  - if not found looks for [profileId]@[version].supr file in superface/grid
   *  - if not found it tries to fetch profile AST from Registry
   *
   * @param profileConfiguration
   * @returns ProfileDocumentNode
   */
  // TODO: Move to SuperfaceClientBase or move to separate file to simplify reause and testing?
  // TODO: Add logs
  // TODO: private
  public async resolveProfileAst(
    profileId: string
  ): Promise<ProfileDocumentNode> {
    // TODO: do we have some util for this? Create it if we don't
    let scope: string | undefined;
    let profileName: string;
    const [scopeOrProfileName, resolvedProfileName] = profileId.split('/');

    if (resolvedProfileName === undefined) {
      profileName = scopeOrProfileName;
    } else {
      profileName = resolvedProfileName;
      scope = scopeOrProfileName;
    }

    // TODO: move to utils?
    const loadProfileAstFile = async (
      fileNameWithExtension: string
    ): Promise<ProfileDocumentNode> => {
      const contents = await this.fileSystem.readFile(fileNameWithExtension);

      if (contents.isErr()) {
        throw contents.error;
      }
      if (fileNameWithExtension.endsWith(EXTENSIONS.profile.build)) {
        // treat as ast.json
        return assertProfileDocumentNode(JSON.parse(contents.value));
      } else if (fileNameWithExtension.endsWith(EXTENSIONS.profile.source)) {
        // treat as .supr
        return Parser.parseProfile(
          contents.value,
          fileNameWithExtension,
          {
            profileName,
            scope,
          },
          this.config.cachePath,
          this.fileSystem
        );
      } else {
        throw new Error('TODO invalid extenstion err');
      }
    };

    const profileSettings = this.superJson.normalized.profiles[profileId];

    if (profileSettings === undefined) {
      // TODO: more suitable error
      throw profileNotInstalledError(profileId);
    }
    let filepath: string;
    if ('file' in profileSettings) {
      filepath = this.superJson.resolvePath(profileSettings.file);
      console.log('file path', filepath);

      return loadProfileAstFile(filepath);
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

    // TODO: make this pretty
    let ast: ProfileDocumentNode | undefined = undefined;
    try {
      ast = await loadProfileAstFile(filepath + EXTENSIONS.profile.build);
      // TODO: cache this somewhere (similar to CLI - .cache, config.cachePath)?
      console.log('ast ok');
    } catch (error) {
      console.log('ast failed', error);
      void error;
    }

    if (ast !== undefined) {
      return ast;
    }

    try {
      ast = await loadProfileAstFile(filepath + EXTENSIONS.profile.source);
      console.log('source ok');
    } catch (error) {
      console.log('source failed', error);
      void error;
    }

    if (ast !== undefined) {
      return ast;
    }

    console.log('fallback');

    // Fallback to remote
    // TODO: cache this somewhere (similar to CLI - .cache, config.cachePath)?
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
