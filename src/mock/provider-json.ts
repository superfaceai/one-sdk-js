import type {
  IntegrationParameter,
  ProviderJson,
  ProviderService,
  SecurityScheme,
} from '@superfaceai/ast';
import { ApiKeyPlacement, HttpScheme, SecurityType } from '@superfaceai/ast';

export const mockProviderJson = (options?: {
  name?: string;
  services?: ProviderService[];
  security?: SecurityScheme[];
  parameters?: IntegrationParameter[];
}): ProviderJson => ({
  name: options?.name ?? 'test',
  services: options?.services ?? [
    { id: 'test-service', baseUrl: 'service/base/url' },
  ],
  securitySchemes: options?.security ?? [
    {
      type: SecurityType.HTTP,
      id: 'basic',
      scheme: HttpScheme.BASIC,
    },
    {
      id: 'api',
      type: SecurityType.APIKEY,
      in: ApiKeyPlacement.HEADER,
      name: 'Authorization',
    },
    {
      id: 'bearer',
      type: SecurityType.HTTP,
      scheme: HttpScheme.BEARER,
      bearerFormat: 'some',
    },
    {
      id: 'digest',
      type: SecurityType.HTTP,
      scheme: HttpScheme.DIGEST,
    },
  ],
  defaultService:
    options?.services !== undefined ? options.services[0].id : 'test-service',
  parameters: options?.parameters ?? [
    {
      name: 'first',
      description: 'first test value',
    },
    {
      name: 'second',
    },
    {
      name: 'third',
      default: 'third-default',
    },
    {
      name: 'fourth',
      default: 'fourth-default',
    },
  ],
});
