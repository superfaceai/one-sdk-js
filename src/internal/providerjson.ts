import * as zod from 'zod';

// BasicAuth
const besicAuth = zod.object({
  id: zod.string(),
  type: zod.literal('http'),
  scheme: zod.literal('basic'),
});

export type BasicAuthSecurity = zod.infer<typeof besicAuth>;

// ApiKey
const apiKey = zod.object({
  id: zod.string(),
  type: zod.literal('apiKey'),
  in: zod.literal('header'),
  name: zod.string().default('Authorization'),
})

export type ApiKeySecurity = zod.infer<typeof apiKey>;

// Bearer
const bearer = zod.object({
  id: zod.string(),
  type: zod.literal('http'),
  scheme: zod.literal('bearer'),
})

export type BearerTokenSecurity = zod.infer<typeof bearer>;

// Type guards
export function isApiKeySecurity(
  auth: ApiKeySecurity | BasicAuthSecurity | BearerTokenSecurity
): auth is ApiKeySecurity {
  return apiKey.check(auth)
}

export function isBasicAuthSecurity(
  auth: ApiKeySecurity | BasicAuthSecurity | BearerTokenSecurity
): auth is BasicAuthSecurity {
  return besicAuth.check(auth)

}

export function isBearerTokenSecurity(
  auth: ApiKeySecurity | BasicAuthSecurity | BearerTokenSecurity
): auth is BearerTokenSecurity {
  return bearer.check(auth)
}

const providerJson = zod.object({
  name: zod.string(),
  services: zod.array(
    zod.object({
      id: zod.string(),
      baseUrl: zod.string(),
    })
  ),
  securitySchemes: zod
    .array(
      zod.union([
        besicAuth,
        apiKey,
        bearer
      ])
    )
    .optional(),
  defaultService: zod.string(),
});

export type ProviderJson = zod.infer<typeof providerJson>;

export function parseProviderJson(input: unknown): ProviderJson {
  return providerJson.parse(input);
}
