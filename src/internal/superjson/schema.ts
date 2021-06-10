import { normalize } from 'path';
import * as zod from 'zod';

// 'Official' regex https://semver.org/#is-there-a-suggested-regular-expression-regex-to-check-a-semver-string
const SEMVER_REGEX =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

// NOT comprehensive at all
export const FILE_URI_PROTOCOL = 'file://';
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

const idBase = zod.object({
  id: zod.string(),
});

const apiKeySecurityValues = idBase.merge(
  zod.object({
    apikey: zod.string(),
  })
);
export function isApiKeySecurityValues(
  input: unknown
): input is ApiKeySecurityValues {
  return apiKeySecurityValues.check(input);
}

const basicAuthSecurityValues = idBase.merge(
  zod.object({
    username: zod.string(),
    password: zod.string(),
  })
);
export function isBasicAuthSecurityValues(
  input: unknown
): input is BasicAuthSecurityValues {
  return basicAuthSecurityValues.check(input);
}

const bearerTokenSecurityValues = idBase.merge(
  zod.object({
    token: zod.string(),
  })
);
export function isBearerTokenSecurityValues(
  input: unknown
): input is BearerTokenSecurityValues {
  return bearerTokenSecurityValues.check(input);
}

const digestSecurityValues = idBase.merge(
  zod.object({
    digest: zod.string(),
  })
);
export function isDigestSecurityValues(
  input: unknown
): input is DigestSecurityValues {
  return digestSecurityValues.check(input);
}

/**
 * Authorization variables.
 * ```
 * {
 *   "id": "$id"
 * } & (
 *   {
 *     "username": "$username",
 *     "password": "$password"
 *   } | {
 *     "apikey": "$value"
 *   } | {
 *     "token": "$value"
 *   } | {
 *     "digest": "$value"
 *   }
 * )
 * ```
 */
const securityValues = zod.union([
  apiKeySecurityValues,
  basicAuthSecurityValues,
  bearerTokenSecurityValues,
  digestSecurityValues,
]);

/**
 * Expanded provider settings for one provider name.
 * ```
 * {
 *   "file": "$file", // opt
 *   "security": $auth // opt
 * }
 * ```
 */
const providerSettings = zod.object({
  file: zod.string().optional(),
  security: zod.array(securityValues).optional(),
});
const normalizedProviderSettings = zod.object({
  file: zod.string().optional(),
  security: zod.array(securityValues),
});

const providerEntry = zod.union([uriPath, providerSettings]);

export const superJsonSchema = zod.object({
  profiles: zod.record(profileEntry).optional(),
  providers: zod.record(providerEntry).optional(),
  // lock: zod.record(lock).optional(),
});

export const normalizedSuperJsonSchema = zod.object({
  profiles: zod.record(normalizedProfileSettings),
  providers: zod.record(normalizedProviderSettings),
});

export type SuperJsonDocument = zod.infer<typeof superJsonSchema>;
export type ProfileEntry = zod.infer<typeof profileEntry>;
export type ProfileSettings = zod.infer<typeof profileSettings>;
export type UsecaseDefaults = zod.infer<typeof usecaseDefaults>;
export type ProfileProviderEntry = zod.infer<typeof profileProviderEntry>;
export type ProfileProviderSettings = zod.infer<typeof profileProviderSettings>;
export type ProviderEntry = zod.infer<typeof providerEntry>;
export type ProviderSettings = zod.infer<typeof providerSettings>;

export type ApiKeySecurityValues = zod.infer<typeof apiKeySecurityValues>;
export type BasicAuthSecurityValues = zod.infer<typeof basicAuthSecurityValues>;
export type BearerTokenSecurityValues = zod.infer<
  typeof bearerTokenSecurityValues
>;
export type DigestSecurityValues = zod.infer<typeof digestSecurityValues>;
export type SecurityValues = zod.infer<typeof securityValues>;

export type NormalizedSuperJsonDocument = zod.infer<
  typeof normalizedSuperJsonSchema
>;
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
