import {
  EXTENSIONS,
  isProfileDocumentNode,
  ProfileDocumentNode,
} from '@superfaceai/ast';

import { IConfig, IFileSystem, LogFunction } from '../interfaces';

export async function tryToLoadCachedAst({
  profileId,
  version,
  fileSystem,
  config,
  log,
}: {
  profileId: string;
  version?: string;
  fileSystem: IFileSystem;
  config: IConfig;
  log?: LogFunction;
}): Promise<ProfileDocumentNode | undefined> {
  if (config.cache === false) {
    return undefined;
  }

  const profileCachePath = fileSystem.path.join(
    config.cachePath,
    `${profileId}${EXTENSIONS.profile.build}`
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
  if (version !== undefined) {
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
  }

  return possibleAst;
}

export async function cacheProfileAst({
  ast,
  fileSystem,
  config,
  log,
}: {
  ast: ProfileDocumentNode;
  fileSystem: IFileSystem;
  config: IConfig;
  log?: LogFunction;
}): Promise<void> {
  // const id: string =
  //   ast.header.scope !== undefined
  //     ? `${ast.header.scope}/${ast.header.name}`
  //     : ast.header.name;

  const profileCachePath =
    ast.header.scope !== undefined
      ? fileSystem.path.join(config.cachePath, ast.header.scope)
      : config.cachePath;

  if (config.cache === true) {
    try {
      await fileSystem.mkdir(profileCachePath, {
        recursive: true,
      });
      const p = fileSystem.path.join(
        profileCachePath,
        ast.header.name + EXTENSIONS.profile.build
      );
      console.log('p', p);
      await fileSystem.writeFile(p, JSON.stringify(ast, undefined, 2));
    } catch (error) {
      console.log('mk err', error);
      log?.(`Failed to cache profile AST for ${ast.header.name}: %O`, error);
    }
  }
}
