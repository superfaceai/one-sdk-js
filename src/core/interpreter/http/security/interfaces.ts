import type {
  ApiKeySecurityScheme,
  ApiKeySecurityValues,
  BasicAuthSecurityScheme,
  BasicAuthSecurityValues,
  BearerTokenSecurityScheme,
  BearerTokenSecurityValues,
  DigestSecurityScheme,
  DigestSecurityValues,
  HttpSecurityRequirement,
} from '@superfaceai/ast';

import type { NonPrimitive, SuperCache, Variables } from '../../../../lib';
import type { FetchParameters, HttpMultiMap } from '../interfaces';
import type { HttpResponse } from '../types';

export const DEFAULT_AUTHORIZATION_HEADER_NAME = 'Authorization';

export type AuthCache = {
  digest: SuperCache<string>;
};

/**
 * This type defines function used for authentization with more complex auth. methods (oauth, diges), we useFetchInstance to fetch auth. response and to set credentials to cache
 */
export type AuthenticateRequestAsync = (
  parameters: RequestParameters
) => Promise<RequestParameters>;

/**
 * This type defines function used for handling response with complex auth methods.
 * It returns undefined (when there is no need to retry request) or úarameters used in new request
 */
export type HandleResponseAsync = (
  response: HttpResponse,
  resourceRequestParameters: RequestParameters
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
  | (DigestSecurityScheme & DigestSecurityValues);

export type RequestParameters = {
  url: string;
  method: string;
  headers?: HttpMultiMap;
  queryParameters?: HttpMultiMap;
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
