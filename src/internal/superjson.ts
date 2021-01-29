import createDebug from 'debug';
import { promises as fspromises } from 'fs';
import { join as joinPath } from 'path';
import * as zod from 'zod';

const { stat, readFile } = fspromises;
const debug = createDebug('superface:superjson');

// 'Official' regex https://semver.org/#is-there-a-suggested-regular-expression-regex-to-check-a-semver-string
const SEMVER_REGEX = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
// NOT comprehensive at all
const FILE_URI_REGEX = /^file:.*$/;

export function isVersionString(input: unknown): boolean {
  return typeof input === 'string' && SEMVER_REGEX.test(input);
}

export function isFileURIString(input: unknown): boolean {
  return typeof input === 'string' && FILE_URI_REGEX.test(input);
}

const semanticVersion = zod.string().regex(SEMVER_REGEX, {
  message: 'Should be valid semver',
});
const localPath = zod.string().regex(FILE_URI_REGEX, {
  message: 'Should be valid file URI',
});

const lock = zod.object({
  version: semanticVersion,
  resolved: zod.string(),
  integrity: zod.string(),
  astResolved: zod.string().optional(),
  astIntegrity: zod.string(),
});

const defaults = zod.record(zod.unknown());

const profileProvider = zod.object({
  mapVariant: zod.string().optional(),
  mapRevision: zod.string().optional(),
  defaults: defaults.optional(),
});

const providers = zod.object({
  providers: zod.record(profileProvider).optional(),
  defaults: defaults.optional(),
});
const profileSettings = zod.union([
  providers.merge(zod.object({ version: semanticVersion })),
  providers.merge(zod.object({ file: localPath })),
]);
const profile = zod.union([semanticVersion, localPath, profileSettings]);

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
]);

const deployment = zod.object({
  baseUrl: zod.string().url(),
});

const providerSettings = zod.object({
  auth: auth.optional(),
  deployments: zod.record(deployment).optional(),
});

const schema = zod.object({
  profiles: zod.record(profile).optional(),
  providers: zod.record(providerSettings).optional(),
  lock: zod.record(lock).optional(),
});

export type Auth = zod.infer<typeof auth>;
export type ProviderSettings = zod.infer<typeof providerSettings>;
export type ProfileSettings = zod.infer<typeof profileSettings>;
export type SuperJSONDocument = zod.infer<typeof schema>;

export function parseSuperJSON(input: unknown): SuperJSONDocument {
  return schema.parse(input);
}

export async function loadSuperJSON(): Promise<SuperJSONDocument | undefined> {
  const basedir = process.cwd();
  const superdir = joinPath(basedir, 'superface');
  const superfile = joinPath(superdir, 'super.json');

  try {
    const statInfo = await stat(superdir);

    if (!statInfo.isDirectory()) {
      debug(`${superdir} is not a directory.`);

      return undefined;
    }
  } catch (e) {
    debug(`Unable to open ${superdir}.`);

    return undefined;
  }

  try {
    const statInfo = await stat(superfile);

    if (!statInfo.isFile()) {
      debug(`${superfile} is not a file.`);

      return undefined;
    }
  } catch (e) {
    debug(`Unable to find ${superfile}.`);

    return undefined;
  }

  let superjson: unknown;
  try {
    const superraw = (await readFile(superfile)).toString();
    superjson = JSON.parse(superraw);
  } catch (e) {
    debug(`Unable to read ${superfile}.`);

    return undefined;
  }

  return parseSuperJSON(superjson);
}
