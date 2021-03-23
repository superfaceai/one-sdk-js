import { NonPrimitive, Variables } from '../interpreter/variables';
import {
  ApiKeyPlacement,
  ApiKeySecurityScheme,
  BasicAuthSecurityScheme,
  BearerTokenSecurityScheme,
  DigestSecurityScheme,
  HttpScheme,
  SecurityType,
} from '../providerjson';
import {
  ApiKeySecurityValues,
  BasicAuthSecurityValues,
  BearerTokenSecurityValues,
  DigestSecurityValues,
} from '../superjson';

export type SecurityConfiguration =
  | (ApiKeySecurityScheme & ApiKeySecurityValues)
  | (BasicAuthSecurityScheme & BasicAuthSecurityValues)
  | (BearerTokenSecurityScheme & BearerTokenSecurityValues)
  | (DigestSecurityScheme & DigestSecurityValues);

export const AUTH_HEADER_NAME = 'Authorization';

export type RequestContext = {
  pathParameters: NonPrimitive;
  queryAuth: Record<string, string>;
  headers: Headers;
  requestBody: Variables | undefined;
};

export function applyApiKeyAuth(
  context: RequestContext,
  configuration: SecurityConfiguration & { type: SecurityType.APIKEY }
): void {
  switch (configuration.in) {
    case ApiKeyPlacement.HEADER:
      context.headers.append(configuration.name, configuration.apikey);
      break;

    case ApiKeyPlacement.BODY:
      if (
        typeof context.requestBody !== 'object' ||
        Array.isArray(context.requestBody)
      ) {
        throw new Error(
          'ApiKey in body can be used only when body is an object.'
        );
      }
      context.requestBody[configuration.name] = configuration.apikey;
      break;

    case ApiKeyPlacement.PATH:
      context.pathParameters[configuration.name] = configuration.apikey;
      break;

    case ApiKeyPlacement.QUERY:
      context.queryAuth[configuration.name] = configuration.apikey;
      break;
  }
}

export function applyHttpAuth(
  context: RequestContext,
  configuration: SecurityConfiguration & { type: SecurityType.HTTP }
): void {
  switch (configuration.scheme) {
    case HttpScheme.BASIC:
      applyBasicAuth(context, configuration);
      break;
    case HttpScheme.BEARER:
      applyBearerToken(context, configuration);
      break;
    case HttpScheme.DIGEST:
      applyDigest(context, configuration);
      break;
  }
}

export function applyBasicAuth(
  context: RequestContext,
  configuration: SecurityConfiguration & {
    type: SecurityType.HTTP;
    scheme: HttpScheme.BASIC;
  }
): void {
  context.headers.append(
    AUTH_HEADER_NAME,
    'Basic ' +
      Buffer.from(
        `${configuration.username}:${configuration.password}`
      ).toString('base64')
  );
}

export function applyBearerToken(
  context: RequestContext,
  configuration: SecurityConfiguration & {
    type: SecurityType.HTTP;
    scheme: HttpScheme.BEARER;
  }
): void {
  context.headers.append(AUTH_HEADER_NAME, `Bearer ${configuration.token}`);
}

export function applyDigest(
  _context: RequestContext,
  _configuration: SecurityConfiguration & {
    type: SecurityType.HTTP;
    scheme: HttpScheme.DIGEST;
  }
): void {
  // TODO: groom implementation
  throw new Error('Not implemented');
}
