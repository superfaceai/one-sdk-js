import {
  ApiKeySecurityScheme,
  ApiKeySecurityValues,
  BasicAuthSecurityScheme,
  BasicAuthSecurityValues,
  BearerTokenSecurityScheme,
  BearerTokenSecurityValues,
  DigestSecurityScheme,
  DigestSecurityValues,
  HttpSecurityRequirement,
  OAuthSecurityScheme,
  OAuthSecurityValues,
  OAuthTokenType,
} from '@superfaceai/ast';

import { NonPrimitive, Variables } from '../../variables';
import { HttpResponse } from '../http';
import { FetchInstance, FetchParameters } from '../interfaces';

export const DEFAULT_AUTHORIZATION_HEADER_NAME = 'Authorization';

//TODO: rename? it's not connected to specific flow
export type AuthCacheAuthorizationCode = {
  //Actual credentials
  accessToken: string;
  refreshToken?: string;
  //expiresIn is not required by rfc.
  expiresAt?: number;
  tokenType: OAuthTokenType;
  scopes: string[];
};

export type AuthCache = {
  digest?: string;
  oauth?: {
    authotizationCode?: AuthCacheAuthorizationCode;
  };
};

/**
 * This type defines function used for authentization with more complex auth. methods (oauth, diges), we useFetchInstance to fetch auth. response and to set credentials to cache
 */
export type AuthenticateRequestAsync = (
  parameters: RequestParameters,
  //TODO: simplify/ get rid of
  fetchInstance: FetchInstance & AuthCache
) => Promise<HttpRequest>;

/**
 * This type defines function used for authentization with simple auth. methods (apiKey, http basic, bearer), there is no need for FetchInstance because we don't need cache or fetching
 */
// export type AuthenticateRequest = (
//   parameters: RequestParameters
// ) => Partial<HttpRequest>;

/**
 * This type defines function used for handling response with digest auth, there is no need for FetchInstance because we don't fetching (just cache).
 * It returns undefined (when there is no need to retry request) or parameters used in new request
 */
// export type HandleResponse = (
//   response: HttpResponse,
//   resourceRequestParameters: RequestParameters,
//   cache: AuthCache
// ) => HttpRequest | undefined;

/**
 * This type defines function used for handling response with complex auth methods.
 * It returns undefined (when there is no need to retry request) or úarameters used in new request
 */
export type HandleResponseAsync = (
  response: HttpResponse,
  resourceRequestParameters: RequestParameters,
  fetchInstance: FetchInstance & AuthCache
) => Promise<HttpRequest | undefined> | undefined;

/**
 * Represents class that is able to prepare (set headers, path etc.) and handle (challange responses for eg. digest) authentication
 */
export interface ISecurityHandler {
  /**
   * Hold SecurityConfiguration context for handling more complex authentizations
   */
  readonly configuration: SecurityConfiguration;

  authenticate: AuthenticateRequestAsync;

  handleResponse?: HandleResponseAsync;
}

export type SecurityConfiguration =
  | (ApiKeySecurityScheme & ApiKeySecurityValues)
  | (BasicAuthSecurityScheme & BasicAuthSecurityValues)
  | (BearerTokenSecurityScheme & BearerTokenSecurityValues)
  | (DigestSecurityScheme & DigestSecurityValues)
  | (OAuthSecurityScheme & OAuthSecurityValues);

export type RequestParameters = {
  url: string;
  method: string;
  headers?: Record<string, string>;
  queryParameters?: Variables;
  body?: Variables;
  contentType?: string;
  accept?: string;
  securityRequirements?: HttpSecurityRequirement[];
  securityConfiguration?: SecurityConfiguration[];
  baseUrl: string;
  pathParameters?: NonPrimitive;
  integrationParameters?: Record<string, string>;
};

export type HttpRequest = FetchParameters & { url: string };
