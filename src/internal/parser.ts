import {
  assertMapDocumentNode,
  assertProfileDocumentNode,
  EXTENSIONS,
  MapDocumentNode,
  ProfileDocumentNode,
} from '@superfaceai/ast';
import { parseMap, parseProfile, Source } from '@superfaceai/parser';
import { createHash } from 'crypto';
import { promises as fsp } from 'fs';
import { join as joinPath } from 'path';

import { Config } from '../config';

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
    const hash = Parser.hash(input);
    const hashedName = `${info.providerName}-${hash}${EXTENSIONS.map.build}`;
    const cachePath = joinPath(
      Config.instance().cachePath,
      ...[...(info.scope !== undefined ? [info.scope] : []), info.profileName]
    );
    const hashedPath = joinPath(cachePath, hashedName);

    // If we have it in memory cache, just return it
    if (this.mapCache[hashedPath] !== undefined) {
      return this.mapCache[hashedPath];
    }

    // If we already have parsed map in cache file, load it
    {
      const parsedMap = await Parser.loadCached(
        hashedPath,
        assertMapDocumentNode,
        this.mapCache
      );
      if (parsedMap !== undefined) {
        return parsedMap;
      }
    }

    // If not, delete old parsed maps
    await Parser.clearFileCache(
      `${info.providerName}-[0-9a-f]+${EXTENSIONS.map.build}`,
      cachePath
    );

    // And write parsed file to cache
    const parsedMap = parseMap(new Source(input, fileName));
    await Parser.writeFileCache(
      parsedMap,
      this.mapCache,
      cachePath,
      hashedPath
    );

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
    const hash = Parser.hash(input);
    const hashedName = `${info.profileName}-${hash}${EXTENSIONS.profile.build}`;
    const cachePath = joinPath(
      Config.instance().cachePath,
      ...[...(info.scope !== undefined ? [info.scope] : [])]
    );
    const hashedPath = joinPath(cachePath, hashedName);

    // If we have it in memory cache, just return it
    if (this.profileCache[hashedPath] !== undefined) {
      return this.profileCache[hashedPath];
    }

    // If we already have parsed map in cache file, load it
    {
      const parsedProfile = await Parser.loadCached(
        hashedPath,
        assertProfileDocumentNode,
        this.profileCache
      );
      if (parsedProfile !== undefined) {
        return parsedProfile;
      }
    }

    // If not, delete old parsed profiles
    await Parser.clearFileCache(
      `${info.profileName}-[0-9a-f]+${EXTENSIONS.profile.build}`,
      cachePath
    );

    // And write parsed file to cache
    const parsedProfile = parseProfile(new Source(input, fileName));
    await this.writeFileCache(
      parsedProfile,
      this.profileCache,
      cachePath,
      hashedPath
    );

    return parsedProfile;
  }

  private static async loadCached<
    T extends MapDocumentNode | ProfileDocumentNode
  >(
    path: string,
    assertion: (node: unknown) => T,
    cache: Record<string, T>
  ): Promise<T | undefined> {
    let fileExists = false;
    try {
      fileExists = (await fsp.stat(path)).isFile();
    } catch (e) {
      void e;
    }
    if (fileExists) {
      const parsed = assertion(
        JSON.parse(await fsp.readFile(path, { encoding: 'utf8' }))
      );
      cache[path] = parsed;

      return parsed;
    }

    return undefined;
  }

  private static async clearFileCache(
    nameFormat: string,
    path: string
  ): Promise<void> {
    const cachedFileRegex = new RegExp(nameFormat);
    try {
      for (const file of (await fsp.readdir(path)).filter(cachedFile =>
        cachedFileRegex.test(cachedFile)
      )) {
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

  private static hash(input: string): string {
    return createHash('shake256', { outputLength: 10 })
      .update(input, 'utf8')
      .digest('hex');
  }
}
