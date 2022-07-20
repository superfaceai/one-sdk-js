import {
  assertProfileDocumentNode,
  EXTENSIONS,
  ProfileDocumentNode,
} from '@superfaceai/ast';

import { SuperJson } from '../../schema-tools';
import {
  NotFoundError,
  profileFileNotFoundError,
  profileNotFoundError,
  sourceFileExtensionFoundError,
  unsupportedFileExtensionError,
} from '../errors';
import { Interceptable } from '../events';
import { IConfig, ICrypto, IFileSystem, ILogger } from '../interfaces';
import { AuthCache, IFetch } from '../interpreter';
import { fetchProfileAst } from '../registry';

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
  logger,
  superJson,
  fileSystem,
  config,
  crypto,
  fetchInstance,
}: {
  profileId: string;
  logger?: ILogger;
  superJson: SuperJson;
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

  const profileSettings = superJson.normalized.profiles[profileId];

  if (profileSettings === undefined) {
    throw profileNotFoundError(profileId);
  }
  let filepath: string;
  if ('file' in profileSettings) {
    filepath = superJson.resolvePath(profileSettings.file);
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
  // assumed to be in grid folder under superface directory
  const gridPath = fileSystem.path.join(
    'grid',
    `${profileId}@${profileSettings.version}`
  );
  const superfaceFolderPath = fileSystem.path.dirname(config.superfacePath);

  filepath =
    fileSystem.path.resolve(superfaceFolderPath, gridPath) +
    EXTENSIONS.profile.build;

  logFunction?.('Reading possible profile file: %S', filepath);
  try {
    return await loadProfileAstFile(filepath);
  } catch (error) {
    logFunction?.(
      'Reading of possible profile file failed with error %O',
      error
    );
    void error;
  }

  logFunction?.('Fetching profile file from registry');

  // Fallback to remote
  return fetchProfileAst(
    `${profileId}@${profileSettings.version}`,
    config,
    crypto,
    fetchInstance,
    logger
  );
}
