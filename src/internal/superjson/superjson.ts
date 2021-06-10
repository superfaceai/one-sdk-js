import createDebug from 'debug';
import { promises as fsp, readFileSync, statSync } from 'fs';
import {
  dirname,
  join as joinPath,
  normalize,
  relative as relativePath,
  resolve as resolvePath,
} from 'path';

import { configHash } from '../../lib/config-hash';

import { err, ok, Result } from '../../lib';
import { isAccessible } from '../../lib/io';
import { normalizeSuperJsonDocument } from './normalize';
import {
  addProfile,
  addProfileProvider,
  addProvider
} from './mutate';

import {
  SuperJsonDocument,
  ProfileEntry,
  ProviderEntry,
  ProfileProviderEntry,
  NormalizedSuperJsonDocument,
  superJsonSchema
} from './schema';

const debug = createDebug('superface:superjson');

export const SUPERFACE_DIR = 'superface';
export const META_FILE = 'super.json';
export const SUPER_PATH = joinPath(SUPERFACE_DIR, META_FILE);

export class SuperJson {
  private normalizedCache?: NormalizedSuperJsonDocument;
  public document: SuperJsonDocument;
  public readonly path: string;

  constructor(document?: SuperJsonDocument, path?: string) {
    this.document = document ?? {};
    this.path = path ?? '';
  }

  // loading and parsing //

  /**
   * Returns the default super.json path based on current `process.cwd()`.
   */
  static defaultPath(): string {
    return joinPath(process.cwd(), 'superface', 'super.json');
  }

  /**
   * Detects the existence of a `super.json` file in specified number of levels
   * of parent directories.
   *
   * @param cwd - currently scanned working directory
   *
   * Returns relative path to a directory where `super.json` is detected.
   */
  static async detectSuperJson(
    cwd: string,
    level?: number
  ): Promise<string | undefined> {
    // check whether super.json is accessible in cwd
    if (await isAccessible(joinPath(cwd, META_FILE))) {
      return normalize(relativePath(process.cwd(), cwd));
    }

    // check whether super.json is accessible in cwd/superface
    if (await isAccessible(joinPath(cwd, SUPER_PATH))) {
      return normalize(
        relativePath(process.cwd(), joinPath(cwd, SUPERFACE_DIR))
      );
    }

    // default behaviour - do not scan outside cwd
    if (level === undefined || level < 1) {
      return undefined;
    }

    // check if user has permissions outside cwd
    cwd = joinPath(cwd, '..');
    if (!(await isAccessible(cwd))) {
      return undefined;
    }

    return await SuperJson.detectSuperJson(cwd, --level);
  }

  static parse(input: unknown): Result<SuperJsonDocument, string> {
    try {
      const superdocument = superJsonSchema.parse(input);

      return ok(superdocument);
    } catch (e: unknown) {
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      return err(`unable to parse super.json: ${e}`);
    }
  }

  static loadSync(path?: string): Result<SuperJson, string> {
    const superfile = path ?? SuperJson.defaultPath();

    try {
      const statInfo = statSync(superfile);

      if (!statInfo.isFile()) {
        return err(`'${superfile}' is not a file`);
      }
    } catch (e: unknown) {
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      return err(`unable to find ${superfile}: ${e}`);
    }

    let superjson: unknown;
    try {
      const superraw = readFileSync(superfile, { encoding: 'utf-8' });
      superjson = JSON.parse(superraw);
    } catch (e: unknown) {
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      return err(`unable to read ${superfile}: ${e}`);
    }

    const superdocument = SuperJson.parse(superjson);
    if (superdocument.isErr()) {
      return err(superdocument.error);
    }

    debug(`loaded super.json from ${superfile}`);

    return ok(new SuperJson(superdocument.value, superfile));
  }

  /**
   * Attempts to load super.json file from expected location `cwd/superface/super.json`
   */
  static async load(path?: string): Promise<Result<SuperJson, string>> {
    const superfile = path ?? SuperJson.defaultPath();

    try {
      const statInfo = await fsp.stat(superfile);

      if (!statInfo.isFile()) {
        return err(`'${superfile}' is not a file`);
      }
    } catch (e: unknown) {
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      return err(`unable to find ${superfile}: ${e}`);
    }

    let superjson: unknown;
    try {
      const superraw = await fsp.readFile(superfile, { encoding: 'utf-8' });
      superjson = JSON.parse(superraw);
    } catch (e: unknown) {
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      return err(`unable to read ${superfile}: ${e}`);
    }

    const superdocument = SuperJson.parse(superjson);
    if (superdocument.isErr()) {
      return err(superdocument.error);
    }

    debug(`loaded super.json from ${superfile}`);

    return ok(new SuperJson(superdocument.value, superfile));
  }

  // mutation //

  addProfile(profileName: string, payload: ProfileEntry): boolean {
    const result = addProfile(this.document, profileName, payload);
    if (result) {
      this.normalizedCache = undefined;
    }

    return result;
  }

  addProfileProvider(
    profileName: string,
    providerName: string,
    payload: ProfileProviderEntry
  ): boolean {
    const result = addProfileProvider(this.document, profileName, providerName, payload);
    if (result) {
      this.normalizedCache = undefined;
    }

    return result;
  }

  addProvider(providerName: string, payload: ProviderEntry): boolean {
    const result = addProvider(this.document, providerName, payload);
    if (result) {
      this.normalizedCache = undefined;
    }

    return result;
  }

  // utilities //

  /**
   * Returns a relative path relative to `path` from `dirname(this.path)`.
   */
  relativePath(path: string): string {
    return relativePath(dirname(this.path), path);
  }

  /**
   * Resolves relative paths as relative to `dirname(this.path)`.
   */
  resolvePath(path: string): string {
    return resolvePath(dirname(this.path), path);
  }

   // other representations //

  get stringified(): string {
    return JSON.stringify(this.document, undefined, 2);
  }

  get normalized(): NormalizedSuperJsonDocument {
    if (this.normalizedCache !== undefined) {
      return this.normalizedCache;
    }

    this.normalizedCache = normalizeSuperJsonDocument(this.document);
    return this.normalizedCache;
  }

  configHash(): string {
    // <profile>:<version/path>,<provider>:<path>,<provider>:<path>
    const profileValues: string[] = []
    for (const [profile, info] of Object.entries(this.normalized.profiles)) {
      let path;
      if ('version' in info) {
        path = info.version;
      } else {
        path = info.file;
      };

      const providers: string[] = Object.entries(info.providers).map(
        ([provider, info]): string => {
          if ('file' in info) {
            return `${provider}:${info.file}`;
          } else {
            return `${provider}:${info.mapVariant ?? ''}-${info.mapRevision ?? ''}`;
          }
        }
      )
      // sort by provider name to be reproducible
      providers.sort();
      const providersString = providers.map(
        p => `,${p}`
      ).join('');

      profileValues.push(
        `${profile}:${path}${providersString}`
      );
    }
    // sort by profile name to be reproducible
    profileValues.sort();

    // <provider>:<path>
    const providerValues: string[] = []
    for (const [provider, info] of Object.entries(this.normalized.providers)) {
      providerValues.push(
        `${provider}:${info.file ?? ''}`
      );
    }
    // sort by provider name to be reproducible
    providerValues.sort();

    return configHash([...profileValues, ...providerValues]);
  }
}
