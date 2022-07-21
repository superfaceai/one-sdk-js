import {
  extractVersion,
  isValidDocumentName,
  ProfileDocumentNode,
} from '@superfaceai/ast';

import { profileAstId, SuperCache, versionToString } from '../../lib';
import { SuperJson } from '../../schema-tools';
import { Config } from '../config';
import {
  invalidIdentifierIdError,
  invalidVersionError,
  profileNotInstalledError,
  unconfiguredProviderInPriorityError,
} from '../errors';
import { Events, Interceptable } from '../events';
import { ICrypto, IFileSystem, ILogger, ITimers } from '../interfaces';
import { AuthCache, IFetch } from '../interpreter';
import { Profile, ProfileConfiguration, resolveProfileAst } from '../profile';
import { IBoundProfileProvider } from '../profile-provider';

export class InternalClient {
  constructor(
    private readonly events: Events,
    private readonly superJson: SuperJson | undefined,
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

  public async getProfile(
    profile: string | { id: string; version?: string }
  ): Promise<Profile> {
    const { id, version } = resolveProfileId(profile);

    const ast = await resolveProfileAst({
      profileId: id,
      version,
      logger: this.logger,
      fetchInstance: this.fetchInstance,
      fileSystem: this.fileSystem,
      config: this.config,
      crypto: this.crypto,
      superJson: this.superJson,
    });
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
    const profileSettings = this.superJson?.normalized.profiles[profileId];
    if (profileSettings === undefined) {
      throw profileNotInstalledError(profileId);
    }

    // TODO: load priority and add it to ProfileConfiguration?
    const priority = profileSettings.priority;
    if (!priority.every(p => this.superJson?.normalized.providers[p])) {
      throw unconfiguredProviderInPriorityError(
        profileId,
        priority,
        Object.keys(this.superJson?.normalized.providers ?? [])
      );
    }

    return new ProfileConfiguration(
      profileId,
      versionToString(ast.header.version)
    );
  }
}

export function resolveProfileId(
  profile: string | { id: string; version?: string }
): { id: string; version?: string } {
  let id: string;
  let version: string | undefined;

  if (typeof profile === 'string') {
    [id, version] = profile.split('@');
  } else {
    id = profile.id;
    version = profile.version;
  }

  // Check if version is full
  if (version !== undefined) {
    const extracted = extractVersion(version);
    if (extracted.minor === undefined) {
      throw invalidVersionError(version, 'minor');
    }
    if (extracted.patch === undefined) {
      throw invalidVersionError(version, 'patch');
    }
  }

  // Check scope and name
  let name: string,
    scope: string | undefined = undefined;
  const [scopeOrName, possibleName] = id.split('/');
  if (possibleName === undefined) {
    name = scopeOrName;
  } else {
    scope = scopeOrName;
    name = possibleName;
  }
  if (scope !== undefined && !isValidDocumentName(scope)) {
    throw invalidIdentifierIdError(scope, 'Scope');
  }

  if (!isValidDocumentName(name)) {
    throw invalidIdentifierIdError(name, 'Name');
  }

  return { id, version };
}
