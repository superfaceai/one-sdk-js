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

//Retry policy
export enum OnFail {
  NONE = 'none',
  CIRCUIT_BREAKER = 'circuit-breaker',
}

export enum BackoffKind {
  EXPONENTIAL = 'exponential',
}
/**
 * RetryPolicy per usecase values.
 * ```
 * {
 *   "$retryPolicy":  "none" | "circuit-breaker" |
 *      {
 *        "kind": "none"
 *      } | {
 *       "kind": "circuit-breaker",
 *       "maxContiguousRetries": number, // opt
 *       "requestTimeout": number, // opt
 *       "backoff": "exponential" | {
 *          "kind": "exponential",
 *          "start": number,
 *          "factor": number,
 *        } // opt
 *   }
 * }
 * ```
 */
const retryPolicy = zod.union([
  zod.literal(OnFail.NONE),
  zod.literal(OnFail.CIRCUIT_BREAKER),
  zod
    .object({
      kind: zod.literal(OnFail.NONE),
    })
    .strict(),
  zod
    .object({
      kind: zod.literal(OnFail.CIRCUIT_BREAKER),
      maxContiguousRetries: zod.number().int().positive().optional(),
      requestTimeout: zod.number().int().positive().optional(),
      backoff: zod
        .union([
          zod.literal(BackoffKind.EXPONENTIAL),
          zod
            .object({
              kind: zod.literal(BackoffKind.EXPONENTIAL),
              start: zod.number().int().positive().optional(),
              factor: zod.number().int().positive().optional(),
            })
            .strict(),
        ])
        .optional(),
    })
    .strict(),
]);

const normalizedRetryPolicy = zod.union([
  zod
    .object({
      kind: zod.literal(OnFail.NONE),
    })
    .strict(),
  zod
    .object({
      kind: zod.literal(OnFail.CIRCUIT_BREAKER),
      maxContiguousRetries: zod.number().int().positive().optional(),
      requestTimeout: zod.number().int().positive().optional(),
      backoff: zod
        .object({
          kind: zod.literal(BackoffKind.EXPONENTIAL),
          start: zod.number().int().positive().optional(),
          factor: zod.number().int().positive().optional(),
        })
        .strict()
        .optional(),
    })
    .strict(),
]);

const providerFailover = zod.boolean().optional();
const normalizedProviderFailover = zod.boolean();

/**
 * Default per usecase values.
 * ```
 * {
 *   "$usecase": {
 *     "input": {
 *       "$field": $value
 *     } // opt
 *     "providerFailover": $providerFailover // opt
 *   }
 * }
 * ```
 */
const usecaseDefaults = zod.record(
  zod
    .object({
      input: zod.record(zod.unknown()).optional(),
      providerFailover: providerFailover.optional(),
    })
    .strict()
);
const normalizedUsecaseDefault = zod.record(
  zod
    .object({
      input: zod.record(zod.unknown()),
      providerFailover: normalizedProviderFailover,
    })
    .strict()
);

/**
 * Default per provider usecase values.
 * ```
 * {
 *   "$usecase": {
 *     "input": {
 *       "$field": $value
 *     } // opt
 *     "retryPolicy": $retryPolicy // opt
 *   }
 * }
 * ```
 */
const profileProviderDefaults = zod.record(
  zod
    .object({
      input: zod.record(zod.unknown()).optional(),
      retryPolicy: retryPolicy.optional(),
    })
    .strict()
);
const normalizedProfileProviderDefaults = zod.record(
  zod
    .object({
      input: zod.record(zod.unknown()),
      retryPolicy: normalizedRetryPolicy,
    })
    .strict()
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
export const profileProviderSettings = zod.union([
  zod
    .object({
      file: zod.string(),
      defaults: profileProviderDefaults.optional(),
    })
    .strict(),
  zod
    .object({
      mapVariant: zod.string().optional(),
      mapRevision: zod.string().optional(),
      defaults: profileProviderDefaults.optional(),
    })
    .strict(),
]);
const normalizedProfileProviderSettings = zod.union([
  zod
    .object({
      file: zod.string(),
      defaults: normalizedProfileProviderDefaults,
    })
    .strict(),
  zod
    .object({
      mapVariant: zod.string().optional(),
      mapRevision: zod.string().optional(),
      defaults: normalizedProfileProviderDefaults,
    })
    .strict(),
]);

/**
 * Profile provider entry containing either `profileProviderSettings` or shorthands.
 */
export const profileProviderEntry = zod.union([
  uriPath,
  profileProviderSettings,
]);

/**
 * Expanded profile settings for one profile id.
 * ```
 * {
 *   "version": "$version",
 *   "priority": "$priority", //opt
 *   "defaults": $usecaseDefaults, // opt
 *   "providers": $profileProviderEntry // opt
 * } | {
 *   "file": "$path",
 *   "priority": "$priority", //opt
 *   "defaults": $usecaseDefaults, // opt
 *   "providers": $profileProviderEntry // opt
 * }
 * ```
 */
export const profileSettings = zod.union([
  zod
    .object({
      version: semanticVersion,
      priority: zod.array(zod.string()).optional(),
      defaults: usecaseDefaults.optional(),
      providers: zod.record(profileProviderEntry).optional(),
    })
    .strict(),
  zod
    .object({
      file: zod.string(),
      priority: zod.array(zod.string()).optional(),
      defaults: usecaseDefaults.optional(),
      providers: zod.record(profileProviderEntry).optional(),
    })
    .strict(),
]);
const normalizedProfileSettings = zod.union([
  zod
    .object({
      version: semanticVersion,
      priority: zod.array(zod.string()),
      defaults: normalizedUsecaseDefault,
      providers: zod.record(normalizedProfileProviderSettings),
    })
    .strict(),
  zod
    .object({
      file: zod.string(),
      priority: zod.array(zod.string()),
      defaults: normalizedUsecaseDefault,
      providers: zod.record(normalizedProfileProviderSettings),
    })
    .strict(),
]);

/**
 * Profile entry containing either `profileSettings` or shorthands.
 */
const profileEntry = zod.union([semanticVersion, uriPath, profileSettings]);

const idBase = zod
  .object({
    id: zod.string(),
  })
  .strict();

const apiKeySecurityValues = idBase.merge(
  zod
    .object({
      apikey: zod.string(),
    })
    .strict()
);
export function isApiKeySecurityValues(
  input: unknown
): input is ApiKeySecurityValues {
  return apiKeySecurityValues.check(input);
}

const basicAuthSecurityValues = idBase.merge(
  zod
    .object({
      username: zod.string(),
      password: zod.string(),
    })
    .strict()
);
export function isBasicAuthSecurityValues(
  input: unknown
): input is BasicAuthSecurityValues {
  return basicAuthSecurityValues.check(input);
}

const bearerTokenSecurityValues = idBase.merge(
  zod
    .object({
      token: zod.string(),
    })
    .strict()
);
export function isBearerTokenSecurityValues(
  input: unknown
): input is BearerTokenSecurityValues {
  return bearerTokenSecurityValues.check(input);
}

const digestSecurityValues = idBase.merge(
  zod
    .object({
      digest: zod.string(),
    })
    .strict()
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
const providerSettings = zod
  .object({
    file: zod.string().optional(),
    security: zod.array(securityValues).optional(),
  })
  .strict();
const normalizedProviderSettings = zod
  .object({
    file: zod.string().optional(),
    security: zod.array(securityValues),
  })
  .strict();

const providerEntry = zod.union([uriPath, providerSettings]);

export const superJsonSchema = zod
  .object({
    profiles: zod.record(profileEntry).optional(),
    providers: zod.record(providerEntry).optional(),
    // lock: zod.record(lock).optional(),
  })
  .strict();

export const normalizedSuperJsonSchema = zod
  .object({
    profiles: zod.record(normalizedProfileSettings),
    providers: zod.record(normalizedProviderSettings),
  })
  .strict();

export type SuperJsonDocument = zod.infer<typeof superJsonSchema>;
export type ProfileEntry = zod.infer<typeof profileEntry>;
export type ProfileSettings = zod.infer<typeof profileSettings>;
export type UsecaseDefaults = zod.infer<typeof usecaseDefaults>;
export type RetryPolicy = zod.infer<typeof retryPolicy>;
export type ProfileProviderDefaults = zod.infer<typeof profileProviderDefaults>;
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
export type NormalizedRetryPolicy = zod.infer<typeof normalizedRetryPolicy>;

export type NormalizedProfileProviderDefaults = zod.infer<
  typeof normalizedProfileProviderDefaults
>;
export type NormalizedProfileProviderSettings = zod.infer<
  typeof normalizedProfileProviderSettings
>;
export type NormalizedProviderSettings = zod.infer<
  typeof normalizedProviderSettings
>;

export type AnonymizedSuperJsonDocument = {
  profiles: Record<
    string,
    {
      version: string | 'file';
      providers: {
        provider: string;
        priority: number;
        version?: string | 'file';
      }[];
    }
  >;
  providers: string[];
};
