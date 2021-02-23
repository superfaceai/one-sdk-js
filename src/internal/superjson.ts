import createDebug from 'debug';
import { promises as fspromises } from 'fs';
import { join as joinPath, normalize } from 'path';
import * as zod from 'zod';

import { err, ok, Result } from '../lib';
import clone from '../lib/clone';
import { castToNonPrimitive, mergeVariables } from './interpreter/variables';

const { stat, readFile } = fspromises;
const debug = createDebug('superface:superjson');

// 'Official' regex https://semver.org/#is-there-a-suggested-regular-expression-regex-to-check-a-semver-string
const SEMVER_REGEX = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

// NOT comprehensive at all
const FILE_URI_PROTOCOL = 'file://';
const FILE_URI_REGEX = /^file:\/\//;

export function isVersionString(input: string): boolean {
  return SEMVER_REGEX.test(input);
}

export function isFileURIString(input: string): boolean {
  return FILE_URI_REGEX.test(input);
}

const semanticVersion = zod.string().regex(SEMVER_REGEX, {
  message: 'Should be valid semver',
});
const uriPath = zod.string().regex(FILE_URI_REGEX, {
  message: 'Should be valid file URI',
});

export const trimFileURI = (path: string): string =>
  normalize(path.replace(FILE_URI_REGEX, ''));

export const composeFileURI = (path: string): string => {
  if (isFileURIString(path)) {
    return path;
  }
  const normalizedPath = normalize(path);

  return normalizedPath.startsWith('../')
    ? `${FILE_URI_PROTOCOL}${normalizedPath}`
    : `${FILE_URI_PROTOCOL}./${normalizedPath}`;
};

// const lock = zod.object({
//   version: semanticVersion,
//   resolved: zod.string(),
//   integrity: zod.string(),
//   astResolved: zod.string().optional(),
//   astIntegrity: zod.string(),
// });

/**
 * Default per usecase values.
 * ```
 * {
 *   "$usecase": {
 *     "input": {
 *       "$field": $value
 *     } // opt
 *   }
 * }
 * ```
 */
const usecaseDefaults = zod.record(
  zod.object({
    input: zod.record(zod.unknown()).optional(),
  })
);
const normalizedUsecaseDefault = zod.record(
  zod.object({
    input: zod.record(zod.unknown()),
  })
);

/**
 * Provider settings for specific profile.
 * ```
 * {
 *   "file": "$path",
 *   "defaults": $usecaseDefaults // opt
 * } | {
 *   "mapVariant": "$variant", // opt
 *   "mapRevision": "$revision", // opt
 *   "defaults": $usecaseDefaults // opt
 * }
 * ```
 */
const profileProviderSettings = zod.union([
  zod.object({
    file: zod.string(),
    defaults: usecaseDefaults.optional(),
  }),
  zod.object({
    mapVariant: zod.string().optional(),
    mapRevision: zod.string().optional(),
    defaults: usecaseDefaults.optional(),
  }),
]);
const normalizedProfileProviderSettings = zod.union([
  zod.object({
    file: zod.string(),
    defaults: normalizedUsecaseDefault,
  }),
  zod.object({
    mapVariant: zod.string().optional(),
    mapRevision: zod.string().optional(),
    defaults: normalizedUsecaseDefault,
  }),
]);

/**
 * Profile provider entry containing either `profileProviderSettings` or shorthands.
 */
const profileProviderEntry = zod.union([uriPath, profileProviderSettings]);

/**
 * Expanded profile settings for one profile id.
 * ```
 * {
 *   "version": "$version",
 *   "defaults": $usecaseDefaults, // opt
 *   "providers": $profileProviderEntry // opt
 * } | {
 *   "file": "$path",
 *   "defaults": $usecaseDefaults, // opt
 *   "providers": $profileProviderEntry // opt
 * }
 * ```
 */
const profileSettings = zod.union([
  zod.object({
    version: semanticVersion,
    defaults: usecaseDefaults.optional(),
    providers: zod.record(profileProviderEntry).optional(),
  }),
  zod.object({
    file: zod.string(),
    defaults: usecaseDefaults.optional(),
    providers: zod.record(profileProviderEntry).optional(),
  }),
]);
const normalizedProfileSettings = zod.union([
  zod.object({
    version: semanticVersion,
    defaults: normalizedUsecaseDefault,
    providers: zod.record(normalizedProfileProviderSettings),
  }),
  zod.object({
    file: zod.string(),
    defaults: normalizedUsecaseDefault,
    providers: zod.record(normalizedProfileProviderSettings),
  }),
]);

/**
 * Profile entry containing either `profileSettings` or shorthands.
 */
const profileEntry = zod.union([semanticVersion, uriPath, profileSettings]);

/**
 * Authorization variables.
 * ```
 * {
 *   "BasicAuth": {
 *     "username": "$username",
 *     "password": "$password"
 *   }
 * } | {
 *   "ApiKey": {
 *     "in": "header | body | query | path",
 *     "name": "$name", // def: Authorization
 *     "value": "$value"
 *   }
 * } | {
 *   "Bearer": {
 *     "name": "$name", // def: Authorization
 *     "value": "$value"
 *   }
 * } | {}
 * ```
 */
const auth = zod.union([
  zod.object({
    BasicAuth: zod.object({
      username: zod.string(),
      password: zod.string(),
    }),
  }),
  zod.object({
    ApiKey: zod.object({
      in: zod.union([
        zod.literal('header'),
        zod.literal('body'),
        zod.literal('query'),
        zod.literal('path'),
      ]),
      name: zod.string().default('Authorization'),
      value: zod.string(),
    }),
  }),
  zod.object({
    Bearer: zod.object({
      name: zod.string().default('Authorization'),
      value: zod.string(),
    }),
  }),
  // allow empty object
  // note: Zod is order sensitive, so this has to come last
  zod.object({}),
]);

/**
 * Expanded provider settings for one provider name.
 * ```
 * {
 *   "file": "$file", // opt
 *   "auth": $auth // opt
 * }
 * ```
 */
const providerSettings = zod.object({
  file: zod.string().optional(),
  auth: auth.optional(),
});
const normalizedProviderSettings = zod.object({
  file: zod.string().optional(),
  auth: auth,
});

const providerEntry = zod.union([uriPath, providerSettings]);

const schema = zod.object({
  profiles: zod.record(profileEntry).optional(),
  providers: zod.record(providerEntry).optional(),
  // lock: zod.record(lock).optional(),
});

const normalizedSchema = zod.object({
  profiles: zod.record(normalizedProfileSettings),
  providers: zod.record(providerSettings),
});

export type SuperJsonDocument = zod.infer<typeof schema>;
export type ProfileEntry = zod.infer<typeof profileEntry>;
export type ProfileSettings = zod.infer<typeof profileSettings>;
export type UsecaseDefaults = zod.infer<typeof usecaseDefaults>;
export type ProfileProviderEntry = zod.infer<typeof profileProviderEntry>;
export type ProfileProviderSettings = zod.infer<typeof profileProviderSettings>;
export type ProviderEntry = zod.infer<typeof providerEntry>;
export type ProviderSettings = zod.infer<typeof providerSettings>;
export type AuthVariables = zod.infer<typeof auth>;

export type NormalizedSuperJsonDocument = zod.infer<typeof normalizedSchema>;
export type NormalizedProfileSettings = zod.infer<
  typeof normalizedProfileSettings
>;
export type NormalizedUsecaseDefaults = zod.infer<
  typeof normalizedUsecaseDefault
>;
export type NormalizedProfileProviderSettings = zod.infer<
  typeof normalizedProfileProviderSettings
>;
export type NormalizedProviderSettings = zod.infer<
  typeof normalizedProviderSettings
>;

export class SuperJson {
  constructor(public document: SuperJsonDocument) {}

  static parseSuperJson(input: unknown): Result<SuperJsonDocument, string> {
    try {
      const superdocument = schema.parse(input);

      return ok(superdocument);
    } catch (e: unknown) {
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      return err(`unable to parse super.json: ${e}`);
    }
  }

  /**
   * Attempts to load super.json file from expected location `cwd/superface/super.json`
   */
  static async loadSuperJson(): Promise<Result<SuperJson, string>> {
    const basedir = process.cwd();
    const superdir = joinPath(basedir, 'superface');
    const superfile = joinPath(superdir, 'super.json');

    try {
      const statInfo = await stat(superdir);

      if (!statInfo.isDirectory()) {
        return err(`${superdir} is not a directory`);
      }
    } catch (e: unknown) {
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      return err(`unable to open ${superdir}: ${e}`);
    }

    try {
      const statInfo = await stat(superfile);

      if (!statInfo.isFile()) {
        return err(`${superfile} is not a file`);
      }
    } catch (e: unknown) {
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      return err(`unable to find ${superfile}: ${e}`);
    }

    let superjson: unknown;
    try {
      const superraw = (await readFile(superfile)).toString();
      superjson = JSON.parse(superraw);
    } catch (e: unknown) {
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      return err(`unable to read ${superfile}: ${e}`);
    }

    const superdocument = SuperJson.parseSuperJson(superjson);
    if (superdocument.isErr()) {
      return err(superdocument.error);
    }

    debug(`loaded super.json from ${superfile}`);

    return ok(new SuperJson(superdocument.value));
  }

  static normalizeProfileProviderSettings(
    profileProviderSettings: ProfileProviderEntry | undefined,
    baseDefaults: NormalizedUsecaseDefaults
  ): NormalizedProfileProviderSettings {
    if (profileProviderSettings === undefined) {
      return {
        defaults: {},
      };
    }

    if (typeof profileProviderSettings === 'string') {
      if (isFileURIString(profileProviderSettings)) {
        return {
          file: profileProviderSettings.slice(FILE_URI_PROTOCOL.length),
          defaults: {},
        };
      }

      throw 'unreachable';
    }

    let normalizedSettings: NormalizedProfileProviderSettings;
    if ('file' in profileProviderSettings) {
      normalizedSettings = {
        file: profileProviderSettings.file,
        defaults: {},
      };
    } else {
      normalizedSettings = {
        mapVariant: profileProviderSettings.mapVariant,
        mapRevision: profileProviderSettings.mapRevision,
        defaults: {},
      };
    }
    normalizedSettings.defaults = SuperJson.normalizeUsecaseDefaults(
      profileProviderSettings.defaults,
      baseDefaults
    );

    return normalizedSettings;
  }

  static normalizeUsecaseDefaults(
    defaults?: UsecaseDefaults,
    base?: NormalizedUsecaseDefaults
  ): NormalizedUsecaseDefaults {
    if (defaults === undefined) {
      if (base == undefined) {
        return {};
      } else {
        return SuperJson.normalizeUsecaseDefaults(base);
      }
    }

    const normalized: NormalizedUsecaseDefaults =
      base !== undefined ? clone(base) : {};
    for (const [usecase, defs] of Object.entries(defaults)) {
      const previousInput =
        castToNonPrimitive(normalized[usecase]?.input) ?? {};

      normalized[usecase] = {
        input: mergeVariables(
          previousInput,
          castToNonPrimitive(defs.input) ?? {}
        ),
      };
    }

    return normalized;
  }

  static normalizeProfileSettings(
    profileEntry: ProfileEntry
  ): NormalizedProfileSettings {
    if (typeof profileEntry === 'string') {
      if (isVersionString(profileEntry)) {
        return {
          version: profileEntry,
          defaults: {},
          providers: {},
        };
      }

      if (isFileURIString(profileEntry)) {
        return {
          file: profileEntry.slice(FILE_URI_PROTOCOL.length),
          defaults: {},
          providers: {},
        };
      }

      throw 'unreachable';
    }

    let normalizedSettings: NormalizedProfileSettings;
    if ('version' in profileEntry) {
      normalizedSettings = {
        version: profileEntry.version,
        defaults: {},
        providers: {},
      };
    } else {
      normalizedSettings = {
        file: profileEntry.file,
        defaults: {},
        providers: {},
      };
    }

    normalizedSettings.defaults = SuperJson.normalizeUsecaseDefaults(
      profileEntry.defaults
    );
    for (const [providerName, profileProviderSettings] of Object.entries(
      profileEntry.providers ?? {}
    )) {
      normalizedSettings.providers[
        providerName
      ] = SuperJson.normalizeProfileProviderSettings(
        profileProviderSettings,
        normalizedSettings.defaults
      );
    }

    return normalizedSettings;
  }

  static normalizeProviderSettings(
    providerEntry: ProviderEntry
  ): NormalizedProviderSettings {
    if (typeof providerEntry === 'string') {
      if (isFileURIString(providerEntry)) {
        return {
          file: providerEntry.slice(FILE_URI_PROTOCOL.length),
          auth: {},
        };
      }

      throw 'unreachable';
    }

    return {
      file: providerEntry.file,
      auth: providerEntry.auth ?? {},
    };
  }

  /** Returns a normalized clone of the document */
  get normalized(): NormalizedSuperJsonDocument {
    // clone
    const document: SuperJsonDocument = clone(this.document);

    // TODO: Do not mutate the original
    const profiles = document.profiles ?? {};
    const normalizedProfiles: Record<string, NormalizedProfileSettings> = {};
    for (const [profileId, profileEntry] of Object.entries(profiles)) {
      normalizedProfiles[profileId] = SuperJson.normalizeProfileSettings(
        profileEntry
      );
    }

    // TODO: Do not mutate the original
    const providers = document.providers ?? {};
    const normalizedProviders: Record<string, NormalizedProviderSettings> = {};
    for (const [providerName, providerEntry] of Object.entries(providers)) {
      normalizedProviders[providerName] = SuperJson.normalizeProviderSettings(
        providerEntry
      );
    }

    const normalized = {
      profiles: normalizedProfiles,
      providers: normalizedProviders,
    };

    return normalized;
  }

  // addProfile(profileId: string): boolean {
  // }

  addProfile(profileName: string, payload: ProfileEntry): boolean {
    const superJson = this.document;
    const targetedProfile = superJson.profiles?.[profileName];

    if (!superJson.profiles) {
      throw new Error(`No profiles found`);
    }

    // if specified profile is not found
    if (!targetedProfile || !superJson.profiles[profileName]) {
      superJson.profiles = {
        ...superJson.profiles,
        [profileName]: payload,
      };

      return true;
    }

    // Priority #1: shorthand notation - file URI or semantic version
    if (typeof payload === 'string') {
      // when specified profile is file URI in shorthand notation
      if (isFileURIString(composeFileURI(payload))) {
        if (
          typeof targetedProfile === 'string' ||
          (Object.entries(targetedProfile.defaults ?? {}).length === 0 &&
            Object.entries(targetedProfile.providers ?? {}).length === 0)
        ) {
          superJson.profiles[profileName] = payload;

          return true;
        }

        superJson.profiles[profileName] = {
          file: trimFileURI(payload),
          defaults: targetedProfile.defaults,
          providers: targetedProfile.providers,
        };

        return true;
      }

      // when specified profile is version in shorthand notation
      if (isVersionString(payload)) {
        if (
          typeof targetedProfile === 'string' ||
          (Object.entries(targetedProfile.defaults ?? {}).length === 0 &&
            Object.entries(targetedProfile.providers ?? {}).length === 0)
        ) {
          superJson.profiles[profileName] = payload;

          return true;
        }

        superJson.profiles[profileName] = {
          version: payload,
          defaults: targetedProfile.defaults,
          providers: targetedProfile.providers,
        };

        return true;
      }

      throw 'unreachable';
    }

    // Priority #2: keep previous structure and merge
    let defaults: UsecaseDefaults | undefined;
    if (typeof targetedProfile === 'string') {
      defaults = payload.defaults;
    } else if (targetedProfile.defaults) {
      defaults = SuperJson.normalizeUsecaseDefaults(
        payload.defaults,
        SuperJson.normalizeUsecaseDefaults(targetedProfile.defaults)
      );
    }

    let providers: Record<string, ProfileProviderEntry> | undefined;
    if (typeof targetedProfile === 'string') {
      providers = payload.providers;
    } else if (targetedProfile.providers) {
      providers = mergeVariables(
        castToNonPrimitive(targetedProfile.providers) ?? {},
        castToNonPrimitive(payload.providers) ?? {}
      ) as Record<string, ProfileProviderEntry> | undefined;
    }

    // when specified profile has defaults, providers and file or version, 
    if ('file' in payload || 'version' in payload) {
      superJson.profiles[profileName] = {
        ...payload,
        defaults,
        providers,
      };

      return true;
    }

    return false;
  }

  addProfileProvider(
    profileName: string,
    providerName: string,
    payload: ProfileProviderEntry
  ): boolean {
    let targetedProfile = this.document.profiles?.[profileName];

    if (!targetedProfile || !this.document.profiles?.[profileName]) {
      throw new Error(`Profile ${profileName} does not exist`);
    }

    // if specified profile has shorthand notation
    if (typeof targetedProfile === 'string') {
      this.document.profiles[
        profileName
      ] = targetedProfile = SuperJson.normalizeProfileSettings(targetedProfile);

      targetedProfile.providers = {
        [providerName]: payload,
      };

      return true;
    }

    const profileProvider = targetedProfile.providers?.[providerName];

    // if specified profile provider is not found
    if (!profileProvider || !targetedProfile.providers?.[providerName]) {
      targetedProfile.providers = {
        ...targetedProfile.providers,
        [providerName]: payload,
      };

      return true;
    }

    // Priority #1: shorthand notation - file URI
    // when specified profile provider is file URI shorthand notation
    if (typeof payload === 'string') {
      if (
        typeof profileProvider === 'string' ||
        Object.entries(profileProvider.defaults ?? {}).length === 0
      ) {
        targetedProfile.providers[providerName] = composeFileURI(payload);

        return true;
      }

      targetedProfile.providers[providerName] = {
        file: trimFileURI(payload),
        defaults: profileProvider.defaults,
      };

      return true;
    }

    // Priority #2: keep previous structure and merge
    let defaults: UsecaseDefaults | undefined;
    if (typeof profileProvider === 'string') {
      defaults = payload.defaults;
    } else if (profileProvider.defaults) {
      defaults = SuperJson.normalizeUsecaseDefaults(
        payload.defaults,
        SuperJson.normalizeUsecaseDefaults(profileProvider.defaults)
      );
    }

    // when specified profile provider has file & defaults
    if ('file' in payload) {
      targetedProfile.providers[providerName] = {
        ...payload,
        defaults,
      };

      return true;
    }

    // when specified profile provider has mapVariant, mapRevision & defaults
    if ('mapVariant' in payload || 'mapRevision' in payload) {
      if (typeof profileProvider === 'string') {
        targetedProfile.providers[providerName] = {
          ...payload,
          defaults,
        };

        return true;
      }

      const mapVariant =
        'mapVariant' in profileProvider
          ? profileProvider.mapVariant
          : undefined;
      const mapRevision =
        'mapRevision' in profileProvider
          ? profileProvider.mapRevision
          : undefined;

      targetedProfile.providers[providerName] = {
        mapVariant: payload.mapVariant ?? mapVariant,
        mapRevision: payload.mapRevision ?? mapRevision,
        defaults,
      };

      return true;
    }

    return false;
  }

  /**
   * Attempts to resolve environment value.
   *
   * If the value starts with `$` character, it attempts to look it up in the environment variables.
   * If the value is not in environment or doesn't start with `$` it is returned as is.
   */
  static resolveEnv(str: string): string {
    let value = str;

    if (str.startsWith('$')) {
      const variable = str.slice(1);
      const env = process.env[variable];
      if (env !== undefined) {
        value = env;
      } else {
        console.warn('Enviroment variable', variable, 'not found');
      }
    }

    return value;
  }

  static resolveEnvRecord<T extends Record<string, unknown>>(record: T): T {
    const result: Partial<T> = {};

    for (const [key, value] of Object.entries(record)) {
      if (typeof value === 'string') {
        // TODO: What the hell does "Type 'string' cannot be used to index type 'Partial<T>'. ts(2536)" even mean
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-explicit-any
        (result as any)[key] = SuperJson.resolveEnv(value);
      } else if (typeof value === 'object' && value !== null) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-explicit-any
        (result as any)[key] = SuperJson.resolveEnvRecord(
          value as Record<string, unknown>
        );
      }
    }

    return result as T;
  }
}
