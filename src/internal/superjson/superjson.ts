import {
  AnonymizedSuperJsonDocument,
  assertSuperJsonDocument,
  NormalizedSuperJsonDocument,
  ProfileEntry,
  ProfileProviderEntry,
  ProviderEntry,
  SuperJsonDocument,
  UsecaseDefaults,
} from '@superfaceai/ast';

import { err, ok, Result } from '../../lib';
import { configHash } from '../../lib/config-hash';
import { ICrypto, NodeCrypto } from '../../lib/crypto';
import { IEnvironment } from '../../lib/environment';
import { NodeEnvironment } from '../../lib/environment/environment.node';
import { IFileSystem } from '../../lib/io';
import { NodeFileSystem } from '../../lib/io/filesystem.node';
import { ILogger } from '../../lib/logger/logger';
import { SDKExecutionError } from '../errors';
import {
  ensureErrorSubclass,
  superJsonFormatError,
  superJsonNotAFileError,
  superJsonNotFoundError,
  superJsonReadError,
} from '../errors.helpers';
import {
  mergeProfile,
  mergeProfileDefaults,
  mergeProfileProvider,
  mergeProvider,
  setPriority,
  setProfile,
  setProfileProvider,
  setProvider,
  swapProfileProviderVariant,
  swapProviderVariant,
} from './mutate';
import { normalizeSuperJsonDocument } from './normalize';

const DEBUG_NAMESPACE = 'superjson';

export const SUPERFACE_DIR = 'superface';
export const META_FILE = 'super.json';
// export const SUPER_PATH = joinPath(SUPERFACE_DIR, META_FILE);

export class SuperJson {
  private normalizedCache?: NormalizedSuperJsonDocument;

  constructor(
    public document: SuperJsonDocument = {},
    public readonly path = '',
    private readonly fileSystem: IFileSystem = NodeFileSystem,
    private readonly environment: IEnvironment = new NodeEnvironment(),
    private readonly crypto: ICrypto = new NodeCrypto(),
    private readonly logger?: ILogger
  ) {}

  // loading and parsing //

  /**
   * Detects the existence of a `super.json` file in specified number of levels
   * of parent directories.
   *
   * @param cwd - currently scanned working directory
   *
   * Returns relative path to a directory where `super.json` is detected.
   */
  public static async detectSuperJson(
    cwd: string,
    level?: number,
    fileSystem: IFileSystem = NodeFileSystem
  ): Promise<string | undefined> {
    // check whether super.json is accessible in cwd
    if (await fileSystem.isAccessible(fileSystem.path.join(cwd, META_FILE))) {
      return fileSystem.path.normalize(
        fileSystem.path.relative(fileSystem.path.cwd(), cwd)
      );
    }

    // check whether super.json is accessible in cwd/superface
    if (
      await fileSystem.isAccessible(
        fileSystem.path.join(cwd, SUPERFACE_DIR, META_FILE)
      )
    ) {
      return fileSystem.path.normalize(
        fileSystem.path.relative(
          fileSystem.path.cwd(),
          fileSystem.path.join(cwd, SUPERFACE_DIR)
        )
      );
    }

    // default behaviour - do not scan outside cwd
    if (level === undefined || level < 1) {
      return undefined;
    }

    // check if user has permissions outside cwd
    cwd = fileSystem.path.join(cwd, '..');
    if (!(await fileSystem.isAccessible(cwd))) {
      return undefined;
    }

    return await SuperJson.detectSuperJson(cwd, --level, fileSystem);
  }

  public static parse(
    input: unknown
  ): Result<SuperJsonDocument, SDKExecutionError> {
    try {
      const superdocument = assertSuperJsonDocument(input);

      return ok(superdocument);
    } catch (e: unknown) {
      return err(superJsonFormatError(ensureErrorSubclass(e)));
    }
  }

  public static loadSync(
    path: string,
    fileSystem: IFileSystem = NodeFileSystem,
    environment: IEnvironment = new NodeEnvironment(),
    crypto: ICrypto = new NodeCrypto(),
    logger?: ILogger
  ): Result<SuperJson, SDKExecutionError> {
    try {
      if (!fileSystem.sync.isAccessible(path)) {
        return err(superJsonNotFoundError(path));
      }

      if (!fileSystem.sync.isFile(path)) {
        return err(superJsonNotAFileError(path));
      }
    } catch (e: unknown) {
      return err(superJsonNotFoundError(path, ensureErrorSubclass(e)));
    }

    let superjson: unknown;
    const superraw = fileSystem.sync.readFile(path);
    if (superraw.isOk()) {
      superjson = JSON.parse(superraw.value);
    } else {
      return err(superJsonReadError(ensureErrorSubclass(superraw.error)));
    }

    const superdocument = SuperJson.parse(superjson);
    if (superdocument.isErr()) {
      return err(superdocument.error);
    }

    logger?.log(DEBUG_NAMESPACE, `loaded super.json from ${path}`);

    return ok(
      new SuperJson(
        superdocument.value,
        path,
        fileSystem,
        environment,
        crypto,
        logger
      )
    );
  }

  /**
   * Attempts to load super.json file from expected location `cwd/superface/super.json`
   */
  public static async load(
    path: string,
    fileSystem: IFileSystem = NodeFileSystem,
    environment: IEnvironment = new NodeEnvironment(),
    crypto: ICrypto = new NodeCrypto(),
    logger?: ILogger
  ): Promise<Result<SuperJson, SDKExecutionError>> {
    try {
      if (!(await fileSystem.isAccessible(path))) {
        return err(superJsonNotFoundError(path));
      }

      if (!(await fileSystem.isFile(path))) {
        return err(superJsonNotAFileError(path));
      }
    } catch (e: unknown) {
      return err(superJsonNotFoundError(path, ensureErrorSubclass(e)));
    }

    let superjson: unknown;
    const superraw = await fileSystem.readFile(path);
    if (superraw.isOk()) {
      superjson = JSON.parse(superraw.value);
    } else {
      return err(superJsonReadError(ensureErrorSubclass(superraw.error)));
    }

    const superdocument = SuperJson.parse(superjson);
    if (superdocument.isErr()) {
      return err(superdocument.error);
    }

    logger?.log(DEBUG_NAMESPACE, `loaded super.json from ${path}`);

    return ok(
      new SuperJson(
        superdocument.value,
        path,
        fileSystem,
        environment,
        crypto,
        logger
      )
    );
  }

  // mutation //
  /**
   * Merge profile defaults into the document.
   *
   * Creates the profile if it doesn't exist.
   */
  public mergeProfileDefaults(
    profileName: string,
    payload: UsecaseDefaults
  ): boolean {
    const changed = mergeProfileDefaults(this.document, profileName, payload);
    if (changed) {
      this.normalizedCache = undefined;
    }

    return changed;
  }

  /**
   * Merge a profile into the document.
   *
   * Creates the profile if it doesn't exist.
   */
  public mergeProfile(
    profileName: string,
    payload: ProfileEntry,
    logger?: ILogger
  ): boolean {
    const changed = mergeProfile(
      this.document,
      profileName,
      payload,
      this.environment,
      logger
    );
    if (changed) {
      this.normalizedCache = undefined;
    }

    return changed;
  }

  /**
   * Sets (completely overwrites) a profile in the document.
   *
   * `payload === undefined` deletes the profile.
   */
  public setProfile(
    profileName: string,
    payload: ProfileEntry | undefined
  ): boolean {
    const changed = setProfile(
      this.document,
      profileName,
      payload,
      this.environment,
      this.logger
    );
    if (changed) {
      this.normalizedCache = undefined;
    }

    return changed;
  }

  /**
   * Merge profile provider into the document.
   *
   * Creates the profile and the profile provider if it doesn't exist.
   */
  public mergeProfileProvider(
    profileName: string,
    providerName: string,
    payload: ProfileProviderEntry
  ): boolean {
    const changed = mergeProfileProvider(
      this.document,
      profileName,
      providerName,
      payload,
      this.environment,
      this.logger
    );
    if (changed) {
      this.normalizedCache = undefined;
    }

    return changed;
  }

  /**
   * Sets (completely overwrites) a profile provider in the document.
   *
   * `payload === undefined` deletes the entry.
   */
  public setProfileProvider(
    profileName: string,
    providerName: string,
    payload: ProfileProviderEntry | undefined
  ): boolean {
    const changed = setProfileProvider(
      this.document,
      profileName,
      providerName,
      payload,
      this.environment,
      this.logger
    );
    if (changed) {
      this.normalizedCache = undefined;
    }

    return changed;
  }

  /**
   * Swaps profile provider variant.
   */
  public swapProfileProviderVariant(
    profileName: string,
    providerName: string,
    variant:
      | { kind: 'local'; file: string }
      | { kind: 'remote'; mapVariant?: string; mapRevision?: string }
  ): boolean {
    const changed = swapProfileProviderVariant(
      this.document,
      profileName,
      providerName,
      variant,
      this.environment,
      this.logger
    );
    if (changed) {
      this.normalizedCache = undefined;
    }

    return changed;
  }

  /**
   * Merge a provider into the document.
   *
   * Creates the provider if it doesn't exist.
   */
  public mergeProvider(providerName: string, payload: ProviderEntry): boolean {
    const changed = mergeProvider(this.document, providerName, payload);
    if (changed) {
      this.normalizedCache = undefined;
    }

    return changed;
  }

  /**
   * Sets (completely overwrites) a provider in the document.
   *
   * `payload === undefined` deletes the provider.
   */
  public setProvider(
    providerName: string,
    payload: ProviderEntry | undefined
  ): boolean {
    const changed = setProvider(this.document, providerName, payload);
    if (changed) {
      this.normalizedCache = undefined;
    }

    return changed;
  }

  public swapProviderVariant(
    providerName: string,
    variant: { kind: 'local'; file: string } | { kind: 'remote' }
  ): boolean {
    const changed = swapProviderVariant(this.document, providerName, variant);
    if (changed) {
      this.normalizedCache = undefined;
    }

    return changed;
  }

  /**
   * Sets the priority array of the profile.
   *
   * Throws if the profile does not exist or of the providers don't exist.
   */
  public setPriority(
    profileName: string,
    providersSortedByPriority: string[]
  ): boolean {
    const result = setPriority(
      this.document,
      profileName,
      providersSortedByPriority,
      this.environment,
      this.logger
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
  public relativePath(path: string): string {
    return this.fileSystem.path.relative(
      this.fileSystem.path.dirname(this.path),
      path
    );
  }

  /**
   * Resolves relative paths as relative to `dirname(this.path)`.
   */
  public resolvePath(path: string): string {
    return this.fileSystem.path.resolve(
      this.fileSystem.path.dirname(this.path),
      path
    );
  }

  // other representations //

  public get stringified(): string {
    return JSON.stringify(this.document, undefined, 2);
  }

  public get normalized(): NormalizedSuperJsonDocument {
    if (this.normalizedCache !== undefined) {
      return this.normalizedCache;
    }

    this.normalizedCache = normalizeSuperJsonDocument(
      this.document,
      this.environment,
      this.logger
    );

    return this.normalizedCache;
  }

  public get anonymized(): AnonymizedSuperJsonDocument {
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

  public get configHash(): string {
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

    return configHash([...profileValues, ...providerValues], this.crypto);
  }
}
