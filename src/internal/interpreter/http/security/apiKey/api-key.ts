import {
  ApiKeyPlacement,
  ApiKeySecurityScheme,
  ApiKeySecurityValues,
} from '@superfaceai/ast';
import createDebug from 'debug';

import { apiKeyInBodyError } from '../../../../errors.helpers';
import { Variables } from '../../../variables';
import { FetchInstance } from '../../interfaces';
import { headersFilter, pipe, prepareRequestFilter } from '../../pipe';
import {
  DEFAULT_AUTHORIZATION_HEADER_NAME,
  ISecurityHandler,
} from '../../security';
import {
  AuthCache,
  AuthenticateRequestAsync,
  RequestParameters,
} from '../interfaces';

const debug = createDebug('superface:http:api-key-handler');

export class ApiKeyHandler implements ISecurityHandler {
  constructor(
    readonly configuration: ApiKeySecurityScheme & ApiKeySecurityValues
  ) {
    debug('Initialized api key authentization handler');
  }

  authenticate: AuthenticateRequestAsync = async (
    parameters: RequestParameters,
    fetchInstance: FetchInstance & AuthCache
  ) => {
    let body: Variables | undefined = parameters.body;
    const headers: Record<string, string> = parameters.headers ?? {};
    const pathParameters = parameters.pathParameters ?? {};
    const queryParameters: Record<string, string> = {};

    const name = this.configuration.name || DEFAULT_AUTHORIZATION_HEADER_NAME;

    switch (this.configuration.in) {
      case ApiKeyPlacement.HEADER:
        debug('Setting api key to header');
        headers[name] = this.configuration.apikey;
        break;

      case ApiKeyPlacement.BODY:
        debug('Setting api key to body');
        body = applyApiKeyAuthInBody(
          body || {},
          name.startsWith('/') ? name.slice(1).split('/') : [name],
          this.configuration.apikey
        );
        break;

      case ApiKeyPlacement.PATH:
        debug('Setting api key to path');
        pathParameters[name] = this.configuration.apikey;
        break;

      case ApiKeyPlacement.QUERY:
        debug('Setting api key to query');
        queryParameters[name] = this.configuration.apikey;
        break;
    }

    return pipe({
      parameters: {
        ...parameters,
        headers,
        pathParameters,
        queryParameters,
        body,
      },
      handler: undefined,
      fetchInstance,
      filters: [headersFilter, prepareRequestFilter],
    });
  };
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
