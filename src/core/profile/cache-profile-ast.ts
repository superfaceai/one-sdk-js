import type { ProfileDocumentNode } from '@superfaceai/ast';
import { EXTENSIONS, isProfileDocumentNode } from '@superfaceai/ast';

import type { IConfig, IFileSystem, LogFunction } from '../../interfaces';

export async function tryToLoadCachedAst({
  profileId,
  version,
  fileSystem,
  config,
  log,
}: {
  profileId: string;
  version: string;
  fileSystem: IFileSystem;
  config: IConfig;
  log?: LogFunction;
}): Promise<ProfileDocumentNode | undefined> {
  if (config.cache === false) {
    return undefined;
  }

  const profileCachePath = fileSystem.path.join(
    config.cachePath,
    'profiles',
    `${profileId}@${version}${EXTENSIONS.profile.build}`
  );

  const contents = await fileSystem.readFile(profileCachePath);
  // Try to load
  if (contents.isErr()) {
    log?.(
      'Reading of cached profile file failed with error %O',
      contents.error
    );

    return undefined;
  }
  // Try to parse
  let possibleAst: unknown;
  try {
    possibleAst = JSON.parse(contents.value);
  } catch (error) {
    log?.('Parsing of cached profile file failed with error %O', error);

    return undefined;
  }

  // Check if valid ProfileDocumentNode
  if (!isProfileDocumentNode(possibleAst)) {
    log?.('Cached profile file is not valid ProfileDocumentNode');

    return undefined;
  }

  // Check id
  const cachedId: string =
    possibleAst.header.scope !== undefined
      ? `${possibleAst.header.scope}/${possibleAst.header.name}`
      : possibleAst.header.name;
  if (profileId !== cachedId) {
    log?.(
      'Cached profile id (%S) does not matched to used id (%S)',
      cachedId,
      profileId
    );

    return undefined;
  }

  // Check version
  const cachedVersion = `${possibleAst.header.version.major}.${possibleAst.header.version.minor}.${possibleAst.header.version.patch}`;
  if (possibleAst.header.version.label !== undefined) {
    version += `-${possibleAst.header.version.label}`;
  }

  if (version !== cachedVersion) {
    log?.(
      'Cached profile version (%S) does not matched to used version (%S)',
      cachedVersion,
      version
    );

    return undefined;
  }

  return possibleAst;
}

export async function cacheProfileAst({
  ast,
  version,
  fileSystem,
  config,
  log,
}: {
  ast: ProfileDocumentNode;
  version: string;
  fileSystem: IFileSystem;
  config: IConfig;
  log?: LogFunction;
}): Promise<void> {
  const profileCachePath =
    ast.header.scope !== undefined
      ? fileSystem.path.join(config.cachePath, 'profiles', ast.header.scope)
      : fileSystem.path.join(config.cachePath, 'profiles');

  if (config.cache === true) {
    try {
      await fileSystem.mkdir(profileCachePath, {
        recursive: true,
      });
      const path = fileSystem.path.join(
        profileCachePath,
        `${ast.header.name}@${version}${EXTENSIONS.profile.build}`
      );
      await fileSystem.writeFile(path, JSON.stringify(ast, undefined, 2));
    } catch (error) {
      log?.(`Failed to cache profile AST for ${ast.header.name}: %O`, error);
    }
  }
}
