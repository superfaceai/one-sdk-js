import {
  ApiKeySecurityScheme,
  ApiKeySecurityValues,
  BasicAuthSecurityScheme,
  BasicAuthSecurityValues,
  BearerTokenSecurityScheme,
  BearerTokenSecurityValues,
  DigestSecurityScheme,
  DigestSecurityValues,
} from '@superfaceai/ast';

import { NonPrimitive, Variables } from '../../variables';
import { HttpResponse } from '../http';
import { FetchParameters } from '../interfaces';
import { OAuthTokenType } from './oauth/authorization-code/authorization-code';

export const DEFAULT_AUTHORIZATION_HEADER_NAME = 'Authorization';

//TODO: Move this to src/internal/interpreter/http/security?
export type AuthCache = {
  digest?: string;
  oauth?: {
    authotizationCode?: {
      //Actual credentials
      accessToken: string;
      refreshToken?: string;
      //expiresIn is not required by rfc.
      expiresAt?: number;
      tokenType: OAuthTokenType;
      scopes: string[];
    };
  };
};

/**
 * Represents class that is able to prepare (set headers, path etc.) and handle (challange responses for eg. digest) authentication
 */
export interface ISecurityHandler {
  /**
   * Hold SecurityConfiguration context for handling more complex authentizations
   */
  readonly configuration: SecurityConfiguration;
  /**
   * Prepares request context for making the api call.
   * @param context context for making request this can be changed during preparation (eg. authorize header will be added)
   * @param cache this cache can hold credentials for some of the authentication methods eg. digest
   */
  // prepare(context: RequestContext, cache: AuthCache): void;
  /**
   * Handles responses for more complex authentization methods (eg. digest)
   * @param response response from http call - can contain challange
   * @param url url of (possibly next) http call
   * @param method method of (possibly next) http call
   * @param context context for making (possibly next) request - this can be changed during preparation (eg. authorize header will be added)
   * @param cache this cache can hold credentials for some of the authentication methods eg. digest
   * @returns flag if we need to retry http request (with new settings applied)
   */
  // handle?(
  //   response: HttpResponse,
  //   url: string,
  //   method: string,
  //   context: RequestContext,
  //   cache: AuthCache
  // ): boolean;

  //New prepare
  prepare(parameters: RequestParameters, cache: AuthCache): HttpRequest;
  //New handle
  handle?(
    response: HttpResponse,
    //Request to original resource endpoint - needed in oauth when we need to switch majority of request parameters
    resourceRequestParameters: RequestParameters,
    cache: AuthCache
  ): HttpRequest | undefined;
}

export type SecurityConfiguration =
  | (ApiKeySecurityScheme & ApiKeySecurityValues)
  | (BasicAuthSecurityScheme & BasicAuthSecurityValues)
  | (BearerTokenSecurityScheme & BearerTokenSecurityValues)
  | (DigestSecurityScheme & DigestSecurityValues);

export type RequestContext = {
  pathParameters: NonPrimitive;
  queryAuth: Record<string, string>;
  headers: Record<string, string>;
  requestBody: Variables | undefined;
};

export type RequestParameters = {
  //Url
  url: string;
  baseUrl: string;
  integrationParameters?: Record<string, string>;
  pathParameters?: NonPrimitive;
  //Body related
  body?: Variables;
  contentType?: string;
  headers: Record<string, string>;
  queryParameters?: Variables;
  method: string;
};

export type HttpRequest = FetchParameters & { url: string };
