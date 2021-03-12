import * as zod from 'zod';

export enum ApiKeySecurityIn {
  HEADER = 'header',
  BODY = 'body',
  PATH = 'path',
  QUERY = 'query',
}
export const API_KEY_AUTH_SECURITY_TYPE = 'apiKey';

export const BASIC_AUTH_SECURITY_SCHEME = 'basic';

export const HTTP_AUTH_SECURITY_TYPE = 'http';

export const BEARER_AUTH_SECURITY_SCHEME = 'bearer';

export const DIGEST_AUTH_SECURITY_SCHEME = 'digest';

// BasicAuth
const basicAuth = zod.object({
  id: zod.string(),
  type: zod.literal(HTTP_AUTH_SECURITY_TYPE),
  scheme: zod.literal(BASIC_AUTH_SECURITY_SCHEME),
});

export type BasicAuthSecurity = zod.infer<typeof basicAuth>;

// ApiKey
const apiKey = zod.object({
  id: zod.string(),
  type: zod.literal(API_KEY_AUTH_SECURITY_TYPE),
  in: zod.nativeEnum(ApiKeySecurityIn),
  name: zod.string().default('Authorization'),
});

export type ApiKeySecurity = zod.infer<typeof apiKey>;

// Bearer
const bearer = zod.object({
  id: zod.string(),
  type: zod.literal(HTTP_AUTH_SECURITY_TYPE),
  scheme: zod.literal(BEARER_AUTH_SECURITY_SCHEME),
});

export type BearerTokenSecurity = zod.infer<typeof bearer>;

//Digest
const digest = zod.object({
  id: zod.string(),
  type: zod.literal(HTTP_AUTH_SECURITY_TYPE),
  scheme: zod.literal(DIGEST_AUTH_SECURITY_SCHEME),
});

export type DigestAuthSecurity = zod.infer<typeof digest>;


// Type guards
export function isApiKeySecurity(
  auth: ApiKeySecurity | BasicAuthSecurity | BearerTokenSecurity | DigestAuthSecurity
): auth is ApiKeySecurity {
  return apiKey.check(auth);
}

export function isBasicAuthSecurity(
  auth: ApiKeySecurity | BasicAuthSecurity | BearerTokenSecurity | DigestAuthSecurity
): auth is BasicAuthSecurity {
  return basicAuth.check(auth);
}

export function isBearerTokenSecurity(
  auth: ApiKeySecurity | BasicAuthSecurity | BearerTokenSecurity | DigestAuthSecurity
): auth is BearerTokenSecurity {
  return bearer.check(auth);
}

export function isDigestAuthSecurity(
  auth: ApiKeySecurity | BasicAuthSecurity | BearerTokenSecurity | DigestAuthSecurity
): auth is DigestAuthSecurity {
  return digest.check(auth);
}

const providerJson = zod.object({
  name: zod.string(),
  services: zod.array(
    zod.object({
      id: zod.string(),
      baseUrl: zod.string(),
    })
  ),
  securitySchemes: zod.array(zod.union([basicAuth, apiKey, bearer, digest])).optional(),
  defaultService: zod.string(),
});

export type ProviderJson = zod.infer<typeof providerJson>;

export function parseProviderJson(input: unknown): ProviderJson {
  return providerJson.parse(input);
}
