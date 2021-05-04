import * as zod from 'zod';

export enum SecurityType {
  APIKEY = 'apiKey',
  HTTP = 'http',
}

export enum ApiKeyPlacement {
  HEADER = 'header',
  BODY = 'body',
  PATH = 'path',
  QUERY = 'query',
}

export enum HttpScheme {
  BASIC = 'basic',
  BEARER = 'bearer',
  DIGEST = 'digest',
}

// ApiKey
const apiKey = zod.object({
  id: zod.string(),
  type: zod.literal(SecurityType.APIKEY),
  in: zod.nativeEnum(ApiKeyPlacement),
  name: zod.string().default('Authorization'),
});
export type ApiKeySecurityScheme = zod.infer<typeof apiKey>;

// BasicAuth
const basicAuth = zod.object({
  id: zod.string(),
  type: zod.literal(SecurityType.HTTP),
  scheme: zod.literal(HttpScheme.BASIC),
});
export type BasicAuthSecurityScheme = zod.infer<typeof basicAuth>;

// Bearer
const bearer = zod.object({
  id: zod.string(),
  type: zod.literal(SecurityType.HTTP),
  scheme: zod.literal(HttpScheme.BEARER),
  bearerFormat: zod.string().optional(),
});
export type BearerTokenSecurityScheme = zod.infer<typeof bearer>;

// Digest
const digest = zod.object({
  id: zod.string(),
  type: zod.literal(SecurityType.HTTP),
  scheme: zod.literal(HttpScheme.DIGEST),
});
export type DigestSecurityScheme = zod.infer<typeof digest>;

const httpSecurity = zod.union([basicAuth, apiKey, bearer, digest]);
export type HttpSecurityScheme = zod.infer<typeof httpSecurity>;

export type SecurityScheme = ApiKeySecurityScheme | HttpSecurityScheme;

const service = zod.object({
  id: zod.string(),
  baseUrl: zod.string(),
});
export type ProviderService = zod.infer<typeof service>;

const providerNameRegEx = new RegExp('^[a-z][_\\-0-9a-z]*$')

export function isValidProviderName(name: string): boolean {
  return providerNameRegEx.test(name);
}

const providerJson = zod.object({
  name: zod.string().regex(providerNameRegEx),
  services: zod.array(service),
  securitySchemes: zod.array(httpSecurity).optional(),
  defaultService: zod.string(),
});
export type ProviderJson = zod.infer<typeof providerJson>;

export function isProviderJson(input: unknown): input is ProviderJson {
  return providerJson.check(input);
}
export function parseProviderJson(input: unknown): ProviderJson {
  return providerJson.parse(input);
}

// Type guards
export function isApiKeySecurityScheme(
  input: SecurityScheme
): input is ApiKeySecurityScheme {
  return apiKey.check(input);
}

export function isBasicAuthSecurityScheme(
  input: SecurityScheme
): input is BasicAuthSecurityScheme {
  return basicAuth.check(input);
}

export function isBearerTokenSecurityScheme(
  input: SecurityScheme
): input is BearerTokenSecurityScheme {
  return bearer.check(input);
}

export function isDigestSecurityScheme(
  input: SecurityScheme
): input is DigestSecurityScheme {
  return digest.check(input);
}
