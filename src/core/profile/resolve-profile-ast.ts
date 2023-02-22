import type {
  NormalizedSuperJsonDocument,
  ProfileDocumentNode,
} from '@superfaceai/ast';
import { assertProfileDocumentNode, EXTENSIONS } from '@superfaceai/ast';

import type { IConfig, ICrypto, IFileSystem, ILogger } from '../../interfaces';
import {
  NotFoundError,
  profileFileNotFoundError,
  sourceFileExtensionFoundError,
  unableToResolveProfileError,
  unsupportedFileExtensionError,
  versionMismatchError,
} from '../errors';
import type { Interceptable } from '../events';
import type { AuthCache, IFetch } from '../interpreter';
import { fetchProfileAst } from '../registry';
import { cacheProfileAst, tryToLoadCachedAst } from './cache-profile-ast';

const DEBUG_NAMESPACE = 'profile-ast-resolution';

/**
 * Resolves profile AST file.
 * File property:
 *  - loads directly passed file
 *  - can point only to .supr or .supr.ast.json file
 *  - throws if file not found or not valid ProfileDocumentNode
 * Version property:
 *  - tries to load it from cache
 *  - if not found it tries to fetch profile AST from Registry
 * @returns ProfileDocumentNode
 */
export async function resolveProfileAst({
  profileId,
  version,
  logger,
  superJson,
  fileSystem,
  config,
  crypto,
  fetchInstance,
}: {
  profileId: string;
  version?: string;
  logger?: ILogger;
  superJson: NormalizedSuperJsonDocument | undefined;
  fileSystem: IFileSystem;
  config: IConfig;
  crypto: ICrypto;
  fetchInstance: IFetch & Interceptable & AuthCache;
}): Promise<ProfileDocumentNode> {
  const logFunction = logger?.log(DEBUG_NAMESPACE);

  const loadProfileAstFile = async (
    fileNameWithExtension: string
  ): Promise<ProfileDocumentNode> => {
    const contents = await fileSystem.readFile(fileNameWithExtension);
    if (contents.isErr()) {
      if (contents.error instanceof NotFoundError) {
        throw profileFileNotFoundError(fileNameWithExtension, profileId);
      }
      throw contents.error;
    }

    return assertProfileDocumentNode(JSON.parse(contents.value));
  };

  const profileSettings = superJson?.profiles[profileId];

  // Error when we don't have profileSettings and version is undefined
  if (profileSettings === undefined && version === undefined) {
    throw unableToResolveProfileError(profileId);
  }
  // when version in profileSettings and version in "getProfile" does not match
  if (
    profileSettings !== undefined &&
    'version' in profileSettings &&
    version !== undefined &&
    profileSettings.version !== version
  ) {
    throw versionMismatchError(profileSettings.version, version);
  }
  let filepath: string, astPath: string;

  let resolvedVersion: string;
  // TODO: do we want to check `file` if we have version from getProfile?
  if (superJson !== undefined && profileSettings !== undefined) {
    if ('file' in profileSettings) {
      let json: unknown = null;

      try {
        json = JSON.parse(profileSettings.file);
      } catch (e) {
        // nothing
      }

      if (json !== null) {
        return assertProfileDocumentNode(json);
      }

      filepath = fileSystem.path.resolve(
        fileSystem.path.dirname(config.superfacePath),
        profileSettings.file
      );

      // if we find source file we assume compiled file next to it
      if (filepath.endsWith(EXTENSIONS.profile.source)) {
        astPath = filepath.replace(
          EXTENSIONS.profile.source,
          EXTENSIONS.profile.build
        );

        // if we don't have build file next to source file
        if (!(await fileSystem.exists(astPath))) {
          throw sourceFileExtensionFoundError(EXTENSIONS.profile.source);
        }
      } else if (filepath.endsWith(EXTENSIONS.profile.build)) {
        astPath = filepath;
      } else {
        // FIX:  SDKExecutionError is used to ensure correct formatting. Improve formatting of UnexpectedError
        throw unsupportedFileExtensionError(
          filepath,
          EXTENSIONS.profile.source
        );
      }

      logFunction?.('Reading possible profile file: %s', astPath);

      return await loadProfileAstFile(astPath);
    }
    resolvedVersion = version ?? profileSettings.version;
  } else {
    resolvedVersion = version as string;
  }

  logFunction?.('Trying to load profile file from cache');

  // Fallback to cache/remote
  const cachedAst = await tryToLoadCachedAst({
    profileId,
    version: resolvedVersion,
    fileSystem,
    config,
    log: logFunction,
  });
  if (cachedAst !== undefined) {
    logFunction?.('Loading profile file from cache successful');

    return cachedAst;
  }
  logFunction?.('Fetching profile file from registry');

  const ast = await fetchProfileAst(
    `${profileId}@${resolvedVersion}`,
    config,
    crypto,
    fetchInstance,
    logger
  );

  await cacheProfileAst({
    ast,
    version: resolvedVersion,
    config,
    fileSystem,
    log: logFunction,
  });

  return ast;
}
