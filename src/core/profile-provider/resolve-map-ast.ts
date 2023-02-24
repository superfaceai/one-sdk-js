import type {
  MapDocumentNode,
  NormalizedSuperJsonDocument,
} from '@superfaceai/ast';
import { assertMapDocumentNode, EXTENSIONS } from '@superfaceai/ast';

import type { IConfig, IFileSystem, ILogger } from '../../interfaces';
import { isSettingsWithAst, UnexpectedError } from '../../lib';
import {
  profileIdsDoNotMatchError,
  profileNotFoundError,
  profileProviderNotFoundError,
  providersDoNotMatchError,
  referencedFileNotFoundError,
  sourceFileExtensionFoundError,
  unsupportedFileExtensionError,
  variantMismatchError,
} from '../errors';

const DEBUG_NAMESPACE = 'map-file-resolution';

export async function resolveMapAst({
  profileId,
  providerName,
  variant,
  superJson,
  fileSystem,
  logger,
  config,
}: {
  profileId: string;
  providerName: string;
  variant?: string;
  logger?: ILogger;
  superJson: NormalizedSuperJsonDocument | undefined;
  fileSystem: IFileSystem;
  config: IConfig;
}): Promise<MapDocumentNode | undefined> {
  if (superJson === undefined) {
    return undefined;
  }
  const profileSettings = superJson.profiles[profileId];

  if (profileSettings === undefined) {
    throw profileNotFoundError(profileId);
  }

  const profileProviderSettings = profileSettings.providers[providerName];

  if (profileProviderSettings === undefined) {
    throw profileProviderNotFoundError(profileId, providerName);
  }

  const log = logger?.log(DEBUG_NAMESPACE);
  if (isSettingsWithAst(profileProviderSettings)) {
    switch (typeof profileProviderSettings.ast) {
      case 'string':
        return assertMapDocumentNode(
          JSON.parse(String(profileProviderSettings.ast))
        );
      case 'object':
        return assertMapDocumentNode(profileProviderSettings.ast);
      default:
        throw new UnexpectedError(
          `Unsupported ast format ${typeof profileProviderSettings.ast}`
        );
    }
  } else if ('file' in profileProviderSettings) {
    let path: string;
    if (profileProviderSettings.file.endsWith(EXTENSIONS.map.source)) {
      path = fileSystem.path.resolve(
        fileSystem.path.dirname(config.superfacePath),
        profileProviderSettings.file.replace(
          EXTENSIONS.map.source,
          EXTENSIONS.map.build
        )
      );
      // check if ast exists to print usefull error (needs to be compiled)
      if (!(await fileSystem.exists(path))) {
        throw sourceFileExtensionFoundError(EXTENSIONS.map.source);
      }
    } else if (profileProviderSettings.file.endsWith(EXTENSIONS.map.build)) {
      path = fileSystem.path.resolve(
        fileSystem.path.dirname(config.superfacePath),
        profileProviderSettings.file
      );
    } else {
      throw unsupportedFileExtensionError(
        profileProviderSettings.file,
        EXTENSIONS.map.source
      );
    }

    log?.(`Reading compiled map from path: "${path}"`);

    const contents = await fileSystem.readFile(
      fileSystem.path.resolve(
        fileSystem.path.dirname(config.superfacePath),
        path
      )
    );

    if (contents.isErr()) {
      throw referencedFileNotFoundError(path, []);
    }

    const ast = assertMapDocumentNode(JSON.parse(contents.value));

    // check if variant match
    if (variant !== ast.header.variant) {
      throw variantMismatchError(ast.header.variant, variant);
    }
    // check if provider name match
    if (providerName !== ast.header.provider) {
      throw providersDoNotMatchError(ast.header.provider, providerName, 'map');
    }
    // check if profile id match
    const astProfileId =
      ast.header.profile.scope !== undefined
        ? `${ast.header.profile.scope}/${ast.header.profile.name}`
        : ast.header.profile.name;
    if (astProfileId !== profileId) {
      throw profileIdsDoNotMatchError(astProfileId, profileId);
    }

    return ast;
  }

  return undefined;
}
