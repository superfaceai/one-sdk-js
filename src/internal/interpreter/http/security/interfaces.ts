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
import { FetchParameters } from '../interfaces';

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

export type MiddleWareAsync = (
  parameters: RequestParameters,
  cache: AuthCache,
  fetch: (request: HttpRequest) => Promise<HttpResponse>
) => Promise<RequestParameters>;

//TODO: when we don't need async we don't need to hold state - we could pass configuration here and ger rid of classe for simple auth
export type MiddleWare = (parameters: RequestParameters) => RequestParameters;

/**
 * Represents class that is able to prepare (set headers, path etc.) and handle (challange responses for eg. digest) authentication
 */
export interface ISecurityHandler {
  /**
   * Hold SecurityConfiguration context for handling more complex authentizations
   */
  readonly configuration: SecurityConfiguration;

  authenticate: MiddleWare | MiddleWareAsync;

  /**
   *  Prepares request parameters for making the api call.
   * @param parameters resource request parameters
   * @param cache this cache can hold credentials for some of the authentication methods eg. digest
   */
  // prepare(
  //   parameters: RequestParameters,
  //   cache: AuthCache
  // ): BeforeHookAuthResult;

  /**
   * Handles responses. Useful in more complex authentization methods (eg. digest)
   * @param response response from http call - can contain challange
   * @param resourceRequestParameters original resource request parameters
   * @param cache this cache can hold credentials for some of the authentication methods eg. digest
   */
  // handle(
  //   response: HttpResponse,
  //   //Request to original resource endpoint - needed in oauth when we need to switch majority of request parameters
  //   resourceRequestParameters: RequestParameters,
  //   cache: AuthCache
  // ): AffterHookAuthResult;
}

export type SecurityConfiguration =
  | (ApiKeySecurityScheme & ApiKeySecurityValues)
  | (BasicAuthSecurityScheme & BasicAuthSecurityValues)
  | (BearerTokenSecurityScheme & BearerTokenSecurityValues)
  | (DigestSecurityScheme & DigestSecurityValues)
  | (OAuthSecurityScheme & OAuthSecurityValues);

export type RequestContext = {
  pathParameters: NonPrimitive;
  queryAuth: Record<string, string>;
  headers: Record<string, string>;
  requestBody: Variables | undefined;
};

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
  // }
  // //Url
  // url: string;
  // baseUrl: string;
  // integrationParameters?: Record<string, string>;
  // pathParameters?: NonPrimitive;
  // //Body related
  // body?: Variables;
  // contentType?: string;
  // headers: Record<string, string>;
  // queryParameters?: Variables;
  // method: string;
};

export type HttpRequest = FetchParameters & { url: string };
