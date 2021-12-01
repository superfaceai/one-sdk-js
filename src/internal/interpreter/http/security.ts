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

import { AuthCache } from '../../..';
import { UnexpectedError } from '../..';
import { apiKeyInBodyError } from '../../errors.helpers';
import { NonPrimitive, Variables } from '../variables';
import { DigestHelper } from './digest';
import { FetchInstance } from './interfaces';

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

export async function applyDigest(
  context: RequestContext,
  _configuration: SecurityConfiguration & {
    type: SecurityType.HTTP;
    scheme: HttpScheme.DIGEST;
  },
  method: string,
  url: string,
  fetchInstance: FetchInstance & AuthCache
): Promise<void> {
  //FIX: Should be passed in super.json configuration
  const user = process.env.CLOCKPLUS_USERNAME;
  if (!user) {
    throw new UnexpectedError('Missing user');
  }
  const password = process.env.CLOCKPLUS_PASSWORD;
  if (!password) {
    throw new UnexpectedError('Missing password');
  }

  //FIX: Provider.json configuration should also contain optional: statusCode, header containing challange, header used for athorization
  const digest = new DigestHelper(user, password, fetchInstance);
  //"Proxy-Authorization" can be also used when communicating thru proxy https://datatracker.ietf.org/doc/html/rfc2617#section-1.2
  context.headers[AUTH_HEADER_NAME] = await digest.prepareAuth(url, method);
}
