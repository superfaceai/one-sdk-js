import {
  EXTENSIONS,
  isMapDocumentNode,
  isProfileDocumentNode,
  MapDocumentNode,
  ProfileDocumentNode,
} from '@superfaceai/ast';
import { parseMap, parseProfile, Source } from '@superfaceai/parser';
import { promises as fsp } from 'fs';
import { join as joinPath } from 'path';

import { Config } from '../config';
import { UnexpectedError } from '.';

export class Parser {
  private static mapCache: Record<string, MapDocumentNode> = {};
  private static profileCache: Record<string, ProfileDocumentNode> = {};

  static async parseMap(
    input: string,
    fileName: string,
    info: {
      profileName: string;
      providerName: string;
      scope?: string;
    }
  ): Promise<MapDocumentNode> {
    const sourceChecksum = new Source(input, fileName).checksum();
    const cachePath = joinPath(
      Config.instance().cachePath,
      ...[...(info.scope !== undefined ? [info.scope] : []), info.profileName]
    );
    const path = joinPath(
      cachePath,
      `${info.providerName}${EXTENSIONS.map.build}`
    );

    // If we have it in memory cache, just return it
    if (
      this.mapCache[path] !== undefined &&
      this.mapCache[path].astMetadata.sourceChecksum === sourceChecksum
    ) {
      return this.mapCache[path];
    }

    // If we already have valid AST in cache file, load it
    let parsedMap = await Parser.loadCached(
      path,
      isMapDocumentNode,
      this.mapCache,
      new Source(input, fileName).checksum()
    );
    if (parsedMap !== undefined) {
      return parsedMap;
    }

    // If not, delete old parsed maps
    await Parser.clearFileCache(path);

    // And write parsed file to cache
    parsedMap = parseMap(new Source(input, fileName));
    if (!isMapDocumentNode(parsedMap)) {
      //TODO: more helpful error - can this be product of not matching AST package versions?
      throw new UnexpectedError('This should not happened');
    }
    await Parser.writeFileCache(parsedMap, this.mapCache, cachePath, path);

    return parsedMap;
  }

  static async parseProfile(
    input: string,
    fileName: string,
    info: {
      profileName: string;
      scope?: string;
    }
  ): Promise<ProfileDocumentNode> {
    const sourceChecksum = new Source(input, fileName).checksum();
    const cachePath = joinPath(
      Config.instance().cachePath,
      ...[...(info.scope !== undefined ? [info.scope] : [])]
    );
    const path = joinPath(
      cachePath,
      `${info.profileName}${EXTENSIONS.profile.build}`
    );

    // If we have it in memory cache, just return it
    if (
      this.profileCache[path] !== undefined &&
      this.profileCache[path].astMetadata.sourceChecksum === sourceChecksum
    ) {
      return this.profileCache[path];
    }

    // If we already have valid AST in cache file, load it
    let parsedProfile = await Parser.loadCached(
      path,
      isProfileDocumentNode,
      this.profileCache,
      sourceChecksum
    );
    // If we have cached AST, we can use it.
    if (parsedProfile !== undefined) {
      return parsedProfile;
    }

    // If not, delete old parsed profiles
    await Parser.clearFileCache(path);

    // And write parsed file to cache
    parsedProfile = parseProfile(new Source(input, fileName));
    if (!isProfileDocumentNode(parsedProfile)) {
      //TODO: more helpful error - can this be product of not matching AST package versions?
      throw new UnexpectedError('This should not happened');
    }
    await this.writeFileCache(
      parsedProfile,
      this.profileCache,
      cachePath,
      path
    );

    return parsedProfile;
  }

  private static async loadCached<
    T extends MapDocumentNode | ProfileDocumentNode
  >(
    path: string,
    guard: (node: unknown) => node is T,
    cache: Record<string, T>,
    sourceHash: string
  ): Promise<T | undefined> {
    let fileExists = false;
    try {
      fileExists = (await fsp.stat(path)).isFile();
    } catch (e) {
      void e;
    }
    if (!fileExists) {
      return undefined;
    }
    const loaded = JSON.parse(
      await fsp.readFile(path, { encoding: 'utf8' })
    ) as unknown;
    //Check if valid type
    if (!guard(loaded)) {
      return undefined;
    }
    //Check if checksum match
    if (loaded.astMetadata.sourceChecksum !== sourceHash) {
      console.log('CHECK');

      return undefined;
    }
    cache[path] = loaded;

    return loaded;
  }

  private static async clearFileCache(path: string): Promise<void> {
    try {
      for (const file of await fsp.readdir(path)) {
        await fsp.unlink(joinPath(path, file));
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
    filePath: string
  ): Promise<void> {
    cache[filePath] = node;
    try {
      await fsp.mkdir(cachePath, { recursive: true });
      await fsp.writeFile(filePath, JSON.stringify(node));
    } catch (e) {
      // Fail silently as the cache is strictly speaking unnecessary
      void e;
    }
  }
}
