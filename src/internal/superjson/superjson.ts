import createDebug from 'debug';
import { promises as fsp, readFileSync, statSync } from 'fs';
import {
  dirname,
  join as joinPath,
  normalize,
  relative as relativePath,
  resolve as resolvePath,
} from 'path';

import { Config } from '../../config';
import { err, ok, Result } from '../../lib';
import { configHash } from '../../lib/config-hash';
import { isAccessible } from '../../lib/io';
import { SDKExecutionError } from '../errors';
import {
  ensureErrorSubclass,
  superJsonFormatError,
  superJsonNotAFileError,
  superJsonNotFoundError,
  superJsonReadError,
} from '../errors.helpers';
import {
  addPriority,
  addProfile,
  addProfileDefaults,
  addProfileProvider,
  addProvider,
} from './mutate';
import { normalizeSuperJsonDocument } from './normalize';
import {
  AnonymizedSuperJsonDocument,
  NormalizedSuperJsonDocument,
  ProfileEntry,
  ProfileProviderEntry,
  ProviderEntry,
  SuperJsonDocument,
  superJsonSchema,
  UsecaseDefaults,
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

  static parse(input: unknown): Result<SuperJsonDocument, SDKExecutionError> {
    try {
      const superdocument = superJsonSchema.parse(input);

      return ok(superdocument);
    } catch (e: unknown) {
      return err(superJsonFormatError(ensureErrorSubclass(e)));
    }
  }

  static loadSync(path?: string): Result<SuperJson, SDKExecutionError> {
    const superfile = path ?? Config().superfacePath;

    try {
      const statInfo = statSync(superfile);

      if (!statInfo.isFile()) {
        return err(superJsonNotAFileError(superfile));
      }
    } catch (e: unknown) {
      return err(superJsonNotFoundError(superfile, ensureErrorSubclass(e)));
    }

    let superjson: unknown;
    try {
      const superraw = readFileSync(superfile, { encoding: 'utf-8' });
      superjson = JSON.parse(superraw);
    } catch (e: unknown) {
      return err(superJsonReadError(ensureErrorSubclass(e)));
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
  static async load(
    path?: string
  ): Promise<Result<SuperJson, SDKExecutionError>> {
    const superfile = path ?? Config().superfacePath;

    try {
      const statInfo = await fsp.stat(superfile);

      if (!statInfo.isFile()) {
        return err(superJsonNotAFileError(superfile));
      }
    } catch (e: unknown) {
      return err(superJsonNotFoundError(superfile, ensureErrorSubclass(e)));
    }

    let superjson: unknown;
    try {
      const superraw = await fsp.readFile(superfile, { encoding: 'utf-8' });
      superjson = JSON.parse(superraw);
    } catch (e: unknown) {
      return err(superJsonReadError(ensureErrorSubclass(e)));
    }

    const superdocument = SuperJson.parse(superjson);
    if (superdocument.isErr()) {
      return err(superdocument.error);
    }

    debug(`loaded super.json from ${superfile}`);

    return ok(new SuperJson(superdocument.value, superfile));
  }

  // mutation //
  addProfileDefaults(profileName: string, payload: UsecaseDefaults): boolean {
    const result = addProfileDefaults(this.document, profileName, payload);
    if (result) {
      this.normalizedCache = undefined;
    }

    return result;
  }

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
    const result = addProfileProvider(
      this.document,
      profileName,
      providerName,
      payload
    );
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

  addPriority(
    profileName: string,
    providersSortedByPriority: string[]
  ): boolean {
    const result = addPriority(
      this.document,
      profileName,
      providersSortedByPriority
    );
    if (result.isOk()) {
      this.normalizedCache = undefined;
    }

    return result.unwrap();
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

  get anonymized(): AnonymizedSuperJsonDocument {
    const profiles: AnonymizedSuperJsonDocument['profiles'] = {};
    for (const [profile, profileEntry] of Object.entries(
      this.normalized.profiles
    )) {
      const providers: typeof profiles[string]['providers'] = [];
      for (const [provider, providerEntry] of Object.entries(
        profileEntry.providers
      )) {
        const anonymizedProvider: typeof providers[number] = {
          provider,
          version: 'unknown',
        };
        const providerPriority = profileEntry.priority.findIndex(
          providerName => provider === providerName
        );
        if (providerPriority > -1) {
          anonymizedProvider.priority = providerPriority;
        }
        if ('file' in providerEntry) {
          anonymizedProvider.version = 'file';
        } else if (
          'mapRevision' in providerEntry &&
          providerEntry.mapRevision !== undefined
        ) {
          anonymizedProvider.version = providerEntry.mapRevision;
          if (providerEntry.mapVariant !== undefined) {
            anonymizedProvider.version += `-${providerEntry.mapVariant}`;
          }
        }

        providers.push(anonymizedProvider);
      }
      profiles[profile] = {
        version: 'version' in profileEntry ? profileEntry.version : 'file',
        providers,
      };
    }

    return {
      profiles,
      providers: Object.keys(this.normalized.providers),
    };
  }

  get configHash(): string {
    // <profile>:<version>,<provider>:<priority>:[<version | file>],<provider>:<path>
    const profileValues: string[] = [];
    for (const [profile, profileEntry] of Object.entries(
      this.anonymized.profiles
    )) {
      const providers: string[] = Object.entries(profileEntry.providers).map(
        ([provider, providerEntry]): string => {
          return [
            provider,
            providerEntry.priority,
            ...(providerEntry.version !== undefined
              ? [providerEntry.version]
              : []),
          ].join(':');
        }
      );
      // sort by provider name to be reproducible
      providers.sort();
      profileValues.push(
        [`${profile}:${profileEntry.version}`, ...providers].join(',')
      );
    }
    // sort by profile name to be reproducible
    profileValues.sort();

    // Copy and sort
    const providerValues = this.anonymized.providers
      .map(provider => provider)
      .sort();

    return configHash([...profileValues, ...providerValues]);
  }
}
