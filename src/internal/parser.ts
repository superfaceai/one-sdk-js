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
    let fileExists = false;
    try {
      fileExists = (await fsp.stat(hashedPath)).isFile();
    } catch (e) {
      void e;
    }
    if (fileExists) {
      const parsedMap = assertMapDocumentNode(
        JSON.parse(await fsp.readFile(hashedPath, { encoding: 'utf8' }))
      );
      this.mapCache[hashedPath] = parsedMap;

      return parsedMap;
    }

    // If not, delete old parsed maps
    const cachedFileRegex = new RegExp(
      `${info.providerName}-[0-9a-f]+${EXTENSIONS.map.build}`
    );
    try {
      for (const file of (await fsp.readdir(cachePath)).filter(cachedFile =>
        cachedFileRegex.test(cachedFile)
      )) {
        await fsp.unlink(file);
      }
    } catch (e) {
      console.log(e);
      void e;
    }

    // And write parsed file to cache
    const parsedMap = parseMap(new Source(input, fileName));
    this.mapCache[hashedPath] = parsedMap;
    try {
      await fsp.mkdir(cachePath, { recursive: true });
      await fsp.writeFile(hashedPath, JSON.stringify(parsedMap));
    } catch (e) {
      // Fail silently as the cache is strictly speaking unnecessary
      void e;
    }

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
    let fileExists = false;
    try {
      fileExists = (await fsp.stat(hashedPath)).isFile();
    } catch (e) {
      void e;
    }
    if (fileExists) {
      const parsedProfile = assertProfileDocumentNode(
        JSON.parse(await fsp.readFile(hashedPath, { encoding: 'utf8' }))
      );
      this.profileCache[hashedPath] = parsedProfile;

      return parsedProfile;
    }

    // If not, delete old parsed profiles
    const cachedFileRegex = new RegExp(
      `${info.profileName}-[0-9a-f]+${EXTENSIONS.profile.build}`
    );
    try {
      for (const file of (await fsp.readdir(cachePath)).filter(cachedFile =>
        cachedFileRegex.test(cachedFile)
      )) {
        await fsp.unlink(file);
      }
    } catch (e) {
      void e;
    }

    // And write parsed file to cache
    const parsedProfile = parseProfile(new Source(input, fileName));
    this.profileCache[hashedPath] = parsedProfile;
    try {
      await fsp.mkdir(cachePath, { recursive: true });
      await fsp.writeFile(hashedPath, JSON.stringify(parsedProfile));
    } catch (e) {
      // Fail silently as the cache is strictly speaking unnecessary
      void e;
    }

    return parsedProfile;
  }

  private static hash(input: string): string {
    return createHash('shake256', { outputLength: 10 })
      .update(input, 'utf8')
      .digest('hex');
  }
}
