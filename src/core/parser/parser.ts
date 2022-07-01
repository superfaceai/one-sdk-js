import {
  EXTENSIONS,
  isMapDocumentNode,
  isProfileDocumentNode,
  MapDocumentNode,
  ProfileDocumentNode,
  VERSION as AstVersion,
} from '@superfaceai/ast';
import {
  PARSED_AST_VERSION,
  parseMap,
  parseProfile,
  Source,
} from '@superfaceai/parser';

import { UnexpectedError } from '../errors';
import { IFileSystem } from '../interfaces';

export class Parser {
  private static mapCache: Record<string, MapDocumentNode> = {};
  private static profileCache: Record<string, ProfileDocumentNode> = {};

  public static async parseMap(
    input: string,
    fileName: string,
    info: {
      profileName: string;
      providerName: string;
      scope?: string;
    },
    cachePath: string,
    fileSystem: IFileSystem
  ): Promise<MapDocumentNode> {
    const sourceChecksum = new Source(input, fileName).checksum();
    const profileCachePath = fileSystem.path.join(
      cachePath,
      ...[...(info.scope !== undefined ? [info.scope] : []), info.profileName]
    );
    const path = fileSystem.path.join(
      profileCachePath,
      `${info.providerName}${EXTENSIONS.map.build}`
    );

    // If we have valid map in memory cache, just return it
    if (
      this.mapCache[path] !== undefined &&
      isMapDocumentNode(this.mapCache[path]) &&
      this.mapCache[path].astMetadata.sourceChecksum === sourceChecksum
    ) {
      return this.mapCache[path];
    }

    // If we already have valid AST in cache file, load it
    let parsedMap = await Parser.loadCached(
      path,
      isMapDocumentNode,
      this.mapCache,
      new Source(input, fileName).checksum(),
      fileSystem
    );
    if (parsedMap !== undefined) {
      return parsedMap;
    }

    // If not, delete old parsed maps
    await Parser.clearFileCache(path, fileSystem);

    // And write parsed file to cache
    parsedMap = parseMap(new Source(input, fileName));
    if (!isMapDocumentNode(parsedMap)) {
      const parserAstVersion = `${PARSED_AST_VERSION.major}.${
        PARSED_AST_VERSION.minor
      }.${PARSED_AST_VERSION.patch}${
        PARSED_AST_VERSION.label !== undefined
          ? '-' + PARSED_AST_VERSION.label
          : ''
      }`;
      throw new UnexpectedError(
        `Parsed map is not valid. This can be caused by not matching versions of package @superfaceai/ast.\nVersion of AST in Parser used to parse map: ${parserAstVersion}.\nVersion of AST used to validation: ${AstVersion}`
      );
    }
    await Parser.writeFileCache(
      parsedMap,
      this.mapCache,
      profileCachePath,
      path,
      fileSystem
    );

    return parsedMap;
  }

  public static async parseProfile(
    input: string,
    fileName: string,
    info: {
      profileName: string;
      scope?: string;
    },
    cachePath: string,
    fileSystem: IFileSystem
  ): Promise<ProfileDocumentNode> {
    const sourceChecksum = new Source(input, fileName).checksum();
    const scopeCachePath = fileSystem.path.join(
      cachePath,
      ...[...(info.scope !== undefined ? [info.scope] : [])]
    );
    const path = fileSystem.path.join(
      scopeCachePath,
      `${info.profileName}${EXTENSIONS.profile.build}`
    );

    // If we have it in memory cache, just return it
    if (
      this.profileCache[path] !== undefined &&
      isProfileDocumentNode(this.profileCache[path]) &&
      this.profileCache[path].astMetadata.sourceChecksum === sourceChecksum
    ) {
      return this.profileCache[path];
    }

    // If we already have valid AST in cache file, load it
    let parsedProfile = await Parser.loadCached(
      path,
      isProfileDocumentNode,
      this.profileCache,
      sourceChecksum,
      fileSystem
    );
    // If we have cached AST, we can use it.
    if (parsedProfile !== undefined) {
      return parsedProfile;
    }

    // If not, delete old parsed profiles
    await Parser.clearFileCache(path, fileSystem);

    // And write parsed file to cache
    parsedProfile = parseProfile(new Source(input, fileName));
    if (!isProfileDocumentNode(parsedProfile)) {
      const parserAstVersion = `${PARSED_AST_VERSION.major}.${
        PARSED_AST_VERSION.minor
      }.${PARSED_AST_VERSION.patch}${
        PARSED_AST_VERSION.label !== undefined
          ? '-' + PARSED_AST_VERSION.label
          : ''
      }`;
      throw new UnexpectedError(
        `Parsed profile is not valid. This can be caused by not matching versions of package @superfaceai/ast.\nVersion of AST in Parser used to parse profile: ${parserAstVersion}.\nVersion of AST used to validation: ${AstVersion}`
      );
    }
    await this.writeFileCache(
      parsedProfile,
      this.profileCache,
      scopeCachePath,
      path,
      fileSystem
    );

    return parsedProfile;
  }

  public static async clearCache(
    cachePath: string,
    fileSystem: IFileSystem
  ): Promise<void> {
    this.mapCache = {};
    this.profileCache = {};

    if (await fileSystem.isAccessible(cachePath)) {
      await fileSystem.rm(cachePath, { recursive: true });
    }
  }

  private static async loadCached<
    T extends MapDocumentNode | ProfileDocumentNode
  >(
    path: string,
    guard: (node: unknown) => node is T,
    cache: Record<string, T>,
    sourceHash: string,
    fileSystem: IFileSystem
  ): Promise<T | undefined> {
    if (!(await fileSystem.exists(path))) {
      return undefined;
    }
    const loaded = JSON.parse(
      (await fileSystem.readFile(path)).unwrap()
    ) as unknown;
    // Check if valid type
    if (!guard(loaded)) {
      return undefined;
    }
    // Check if checksum match
    if (loaded.astMetadata.sourceChecksum !== sourceHash) {
      return undefined;
    }
    cache[path] = loaded;

    return loaded;
  }

  private static async clearFileCache(
    path: string,
    fileSystem: IFileSystem
  ): Promise<void> {
    const files = await fileSystem.readdir(path);
    if (files.isErr()) {
      return;
    }

    try {
      for (const file of files.value) {
        await fileSystem.rm(fileSystem.path.join(path, file));
      }
    } catch (e) {
      void e;
    }
  }

  private static async writeFileCache<
    T extends MapDocumentNode | ProfileDocumentNode
  >(
    node: T,
    cache: Record<string, T>,
    cachePath: string,
    filePath: string,
    fileSystem: IFileSystem
  ): Promise<void> {
    cache[filePath] = node;
    try {
      await fileSystem.mkdir(cachePath, { recursive: true });
      await fileSystem.writeFile(filePath, JSON.stringify(node));
    } catch (e) {
      // Fail silently as the cache is strictly speaking unnecessary
      void e;
    }
  }
}
