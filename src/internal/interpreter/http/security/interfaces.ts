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

// export type BeforeHookAuthResult = BeforeHookResult<
//   InstanceType<typeof HttpClient>['makeRequest']
// >;
// export type AffterHookAuthResult = AfterHookResult<
//   InstanceType<typeof HttpClient>['makeRequest']
// >;

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
//TODO: Move this to src/internal/interpreter/http/security?
export type AuthCache = {
  digest?: string;
  oauth?: {
    authotizationCode?: AuthCacheAuthorizationCode;
  };
};

export type AuthenticateRequestAsync = (
  parameters: RequestParameters,
  //TODO: simplify/ get rid of
  cache: AuthCache,
  fetchInstance: FetchInstance,
  fetch: (
    fetchInstance: FetchInstance,
    request: HttpRequest
  ) => Promise<HttpResponse>
) => Promise<RequestParameters>;

export type AuthenticateRequest = (
  parameters: RequestParameters
) => RequestParameters;

export type HandleResponse = (
  response: HttpResponse,
  resourceRequestParameters: RequestParameters,
  cache: AuthCache
) => RequestParameters | undefined;

export type HandleResponseAsync = (
  response: HttpResponse,
  resourceRequestParameters: RequestParameters,
  cache: AuthCache,
  fetchInstance: FetchInstance,
  fetch: (
    fetchInstance: FetchInstance,
    request: HttpRequest
  ) => Promise<HttpResponse>
) => Promise<RequestParameters | undefined>;

/**
 * Represents class that is able to prepare (set headers, path etc.) and handle (challange responses for eg. digest) authentication
 */
export interface ISecurityHandler {
  /**
   * Hold SecurityConfiguration context for handling more complex authentizations
   */
  readonly configuration: SecurityConfiguration;

  authenticate: AuthenticateRequest | AuthenticateRequestAsync;

  handleResponse?: HandleResponse | HandleResponseAsync;
}

export type SecurityConfiguration =
  | (ApiKeySecurityScheme & ApiKeySecurityValues)
  | (BasicAuthSecurityScheme & BasicAuthSecurityValues)
  | (BearerTokenSecurityScheme & BearerTokenSecurityValues)
  | (DigestSecurityScheme & DigestSecurityValues)
  | (OAuthSecurityScheme & OAuthSecurityValues);

// export type RequestContext = {
//   pathParameters: NonPrimitive;
//   queryAuth: Record<string, string>;
//   headers: Record<string, string>;
//   requestBody: Variables | undefined;
// };

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
