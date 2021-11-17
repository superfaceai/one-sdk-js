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
      if (
        typeof context.requestBody !== 'object' ||
        Array.isArray(context.requestBody)
      ) {
        throw apiKeyInBodyError(
          Array.isArray(context.requestBody)
            ? 'Array'
            : typeof context.requestBody
        );
      }
      context.requestBody[name] = configuration.apikey;
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
  fetchInstance: FetchInstance
): Promise<void> {
  //FIX: Should be passed in configuration
  const user = process.env.CLOCKPLUS_USERNAME;
  if (!user) {
    throw new UnexpectedError('Missing user');
  }
  const password = process.env.CLOCKPLUS_PASSWORD;
  if (!password) {
    throw new UnexpectedError('Missing password');
  }

  const digest = new DigestHelper(user, password, fetchInstance);

  context.headers[AUTH_HEADER_NAME] = await digest.auth(url, method);
}
