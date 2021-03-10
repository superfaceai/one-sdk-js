import * as zod from 'zod';

const providerJson = zod.object({
  name: zod.string(),
  services: zod.array(
    zod.object({
      id: zod.string(),
      baseUrl: zod.string(),
    })
  ),
  securitySchemes: zod.array(zod.union([
    zod.object({
      // BasicAuth
      id: zod.string(),
      type: zod.literal('http'),
      scheme: zod.literal('basic'),
    }),
    zod.object({
      // ApiKey
      id: zod.string(),
      type: zod.literal('apiKey'),
      in: zod.literal('query'),
      name: zod.string().default('Authorization'),
    }),
    zod.object({
      // Bearer
      id: zod.string(),
      type: zod.literal('http'),
      scheme: zod.literal('bearer'),
    }),
    // allow empty object
    // note: Zod is order sensitive, so this has to come last
    zod.object({}),
  ])).optional(),
  defaultService: zod.string(),
});

export type ProviderJson = zod.infer<typeof providerJson>;

export function parseProviderJson(input: unknown): ProviderJson {
  return providerJson.parse(input);
}
