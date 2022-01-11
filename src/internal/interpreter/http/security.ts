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
import { UnexpectedError } from '../../errors';
import { apiKeyInBodyError } from '../../errors.helpers';
import { NonPrimitive, Variables } from '../variables';
import { HttpResponse } from '.';
import { DigestHelper } from './digest';
// import { FetchInstance, FetchParameters } from './interfaces';

const DEFAULT_AUTHORIZATION_HEADER_NAME = 'Authorization';

/**
 * Represents class that is able to prepare authentication
 */
export interface SecurityHandler {
  prepare(context: RequestContext, configuration: SecurityConfiguration & { type: SecurityType }, cache?: AuthCache): void,
  handle?(response: HttpResponse, url: string, method: string, context: RequestContext, cache?: AuthCache): boolean
}

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

export class DigestHandler implements SecurityHandler {
  private helper?: DigestHelper

  prepare(context: RequestContext, _configuration: SecurityConfiguration & { type: SecurityType; }, cache?: AuthCache): void {
    //FIX: Should be passed in super.json configuration
    const user = process.env.CLOCKPLUS_USERNAME;
    if (!user) {
      throw new UnexpectedError('Missing user');
    }
    const password = process.env.CLOCKPLUS_PASSWORD;
    if (!password) {
      throw new UnexpectedError('Missing password');
    }
    this.helper = new DigestHelper({ credentials: { user, password } })

    if (cache?.cache?.digest) {
      context.headers[AUTH_HEADER_NAME] = cache.cache.digest
    }
  }

  handle(response: HttpResponse, url: string, method: string, context: RequestContext, _cache?: AuthCache): boolean {
    if (!this.helper) {
      throw new Error('Digest helper not initialized')
    }
    const credentials = this.helper.handle(response, url, method)
    if (credentials) {
      context.headers[AUTH_HEADER_NAME] = credentials
      return true
    }
    return false

  }

}
export class ApiKeyHandler implements SecurityHandler {
  prepare(context: RequestContext, configuration: SecurityConfiguration & { type: SecurityType.APIKEY; }): void {
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
  handle: undefined;
}

export class HttpHandler implements SecurityHandler {
  prepare(context: RequestContext, configuration: SecurityConfiguration & { type: SecurityType.HTTP; }): void {
    switch (configuration.scheme) {
      case HttpScheme.BASIC:
        applyBasicAuth(context, configuration);
        break;
      case HttpScheme.BEARER:
        applyBearerToken(context, configuration);
        break;
    }
  }
}

function applyApiKeyAuthInBody(
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

// export async function useDigest(
//   _context: RequestContext,
//   _configuration: SecurityConfiguration & {
//     type: SecurityType.HTTP;
//     scheme: HttpScheme.DIGEST;
//   },
//   options: {
//     fetchInstance: FetchInstance & AuthCache;
//     useFetch: (options: {
//       fetchInstance: FetchInstance;
//       url: string;
//       headers: Record<string, string>;
//       requestBody: Variables | undefined;
//       request: FetchParameters;
//     }) => Promise<HttpResponse>;
//     url: string;
//     headers: Record<string, string>;
//     request: FetchParameters;
//     requestBody: Variables | undefined;
//   }
// ): Promise<HttpResponse> {
//   const { fetchInstance, url, headers, request, requestBody, useFetch } =
//     options;

//   //FIX: Should be passed in super.json configuration
//   const user = process.env.CLOCKPLUS_USERNAME;
//   if (!user) {
//     throw new UnexpectedError('Missing user');
//   }
//   const password = process.env.CLOCKPLUS_PASSWORD;
//   if (!password) {
//     throw new UnexpectedError('Missing password');
//   }

//   const digestHelper = new DigestHelper({
//     fetchInstance,
//     useFetch,
//     credentials: {
//       user,
//       password,
//     },
//   });

//   return digestHelper.use({ url, headers, request, requestBody });
// }
