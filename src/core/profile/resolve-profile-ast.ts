import {
  assertProfileDocumentNode,
  EXTENSIONS,
  ProfileDocumentNode,
} from '@superfaceai/ast';

import { SuperJson } from '../../schema-tools';
import {
  NotFoundError,
  profileFileNotFoundError,
  sourceFileExtensionFoundError,
  unableToResolveProfileError,
  unsupportedFileExtensionError,
  versionMismatchError,
} from '../errors';
import { Interceptable } from '../events';
import { IConfig, ICrypto, IFileSystem, ILogger } from '../interfaces';
import { AuthCache, IFetch } from '../interpreter';
import { fetchProfileAst } from '../registry';
import { cacheProfileAst, tryToLoadCachedAst } from './cache-profile-ast';

const DEBUG_NAMESPACE = 'profile-ast-resolution';

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
  superJson: SuperJson | undefined;
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

  const profileSettings = superJson?.normalized.profiles[profileId];

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
  let filepath: string;

  let resolvedVersion: string;
  // TODO: do we want to check `file` if we have version from getProfile?
  if (superJson !== undefined && profileSettings !== undefined) {
    if ('file' in profileSettings) {
      filepath = superJson.resolvePath(profileSettings.file);
      logFunction?.('Reading possible profile file: %s', filepath);
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
    resolvedVersion = version ?? profileSettings.version;
  } else {
    resolvedVersion = version as string;
  }
  const gridPath = fileSystem.path.join(
    'grid',
    `${profileId}@${resolvedVersion}`
  );
  const superfaceFolderPath = fileSystem.path.dirname(config.superfacePath);

  filepath =
    fileSystem.path.resolve(superfaceFolderPath, gridPath) +
    EXTENSIONS.profile.build;

  logFunction?.('Reading possible profile file: %S', filepath);
  try {
    // TODO: do we want to cache it on cachePath?
    return await loadProfileAstFile(filepath);
  } catch (error) {
    logFunction?.(
      'Reading of possible profile file failed with error %O',
      error
    );
    void error;
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
    config,
    fileSystem,
    log: logFunction,
  });

  return ast;
}
