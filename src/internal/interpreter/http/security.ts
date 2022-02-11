import {
  ApiKeyPlacement,
  ApiKeySecurityScheme,
  ApiKeySecurityValues,
  BasicAuthSecurityScheme,
  BasicAuthSecurityValues,
  BearerTokenSecurityScheme,
  BearerTokenSecurityValues,
  DigestSecurityScheme,
  DigestSecurityValues,
  HttpScheme,
  SecurityType,
} from '@superfaceai/ast';

import { UnexpectedError } from '../../errors';
import { apiKeyInBodyError } from '../../errors.helpers';
import { NonPrimitive, Variables } from '../variables';

const DEFAULT_AUTHORIZATION_HEADER_NAME = 'Authorization';

export type SecurityConfiguration =
  | (ApiKeySecurityScheme & ApiKeySecurityValues)
  | (BasicAuthSecurityScheme & BasicAuthSecurityValues)
  | (BearerTokenSecurityScheme & BearerTokenSecurityValues)
  | (DigestSecurityScheme & DigestSecurityValues);

export const AUTH_HEADER_NAME = 'Authorization';

export type RequestContext = {
  pathParameters: NonPrimitive;
  queryAuth: Record<string, string>;
  headers: Record<string, string>;
  requestBody: Variables | undefined;
};

export function applyApiKeyAuthInBody(
  requestBody: Variables,
  referenceTokens: string[],
  apikey: string,
  visitedReferenceTokens: string[] = []
): Variables {
  if (typeof requestBody !== 'object' || Array.isArray(requestBody)) {
    const valueLocation = visitedReferenceTokens.length
      ? `value at /${visitedReferenceTokens.join('/')}`
      : 'body';
    const bodyType = Array.isArray(requestBody) ? 'Array' : typeof requestBody;

    throw apiKeyInBodyError(valueLocation, bodyType);
  }

  const token = referenceTokens.shift();
  if (token === undefined) {
    return apikey;
  }

  const segVal = requestBody[token] ?? {};
  requestBody[token] = applyApiKeyAuthInBody(segVal, referenceTokens, apikey, [
    ...visitedReferenceTokens,
    token,
  ]);

  return requestBody;
}

export function applyApiKeyAuth(
  context: RequestContext,
  configuration: SecurityConfiguration & { type: SecurityType.APIKEY }
): void {
  const name = configuration.name || DEFAULT_AUTHORIZATION_HEADER_NAME;

  switch (configuration.in) {
    case ApiKeyPlacement.HEADER:
      context.headers[name] = configuration.apikey;
      break;

    case ApiKeyPlacement.BODY:
      context.requestBody = applyApiKeyAuthInBody(
        context.requestBody ?? {},
        name.startsWith('/') ? name.slice(1).split('/') : [name],
        configuration.apikey
      );
      break;

    case ApiKeyPlacement.PATH:
      context.pathParameters[name] = configuration.apikey;
      break;

    case ApiKeyPlacement.QUERY:
      context.queryAuth[name] = configuration.apikey;
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
  context.headers[AUTH_HEADER_NAME] =
    'Basic ' +
    Buffer.from(`${configuration.username}:${configuration.password}`).toString(
      'base64'
    );
}

export function applyBearerToken(
  context: RequestContext,
  configuration: SecurityConfiguration & {
    type: SecurityType.HTTP;
    scheme: HttpScheme.BEARER;
  }
): void {
  context.headers[AUTH_HEADER_NAME] = `Bearer ${configuration.token}`;
}

export function applyDigest(
  _context: RequestContext,
  _configuration: SecurityConfiguration & {
    type: SecurityType.HTTP;
    scheme: HttpScheme.DIGEST;
  }
): void {
  // TODO: groom implementation
  throw new UnexpectedError('Not implemented');
}
