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

import { AuthCache } from '../../../../client';
import { NonPrimitive, Variables } from '../../variables';
import { HttpResponse } from '../http';

export const DEFAULT_AUTHORIZATION_HEADER_NAME = 'Authorization';

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
  prepare(context: RequestContext, cache: AuthCache): void;
  /**
   * Handles responses for more complex authentization methods (eg. digest)
   * @param response response from http call - can contain challange
   * @param url url of (possibly next) http call
   * @param method method of (possibly next) http call
   * @param context context for making (possibly next) request - this can be changed during preparation (eg. authorize header will be added)
   * @param cache this cache can hold credentials for some of the authentication methods eg. digest
   * @returns flag if we need to retry http request (with new settings applied)
   */
  handle?(
    response: HttpResponse,
    url: string,
    method: string,
    context: RequestContext,
    cache: AuthCache
  ): boolean;
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
