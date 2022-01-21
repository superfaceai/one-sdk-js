import {
  ApiKeyPlacement,
  ApiKeySecurityScheme,
  ApiKeySecurityValues,
} from '@superfaceai/ast';

import { apiKeyInBodyError } from '../../../../errors.helpers';
import { Variables } from '../../../variables';
import { HttpResponse } from '../../http';
import {
  DEFAULT_AUTHORIZATION_HEADER_NAME,
  ISecurityHandler,
} from '../../security';
import {
  AffterHookAuthResult,
  AuthCache,
  BeforeHookAuthResult,
  RequestParameters,
} from '../interfaces';

export class ApiKeyHandler implements ISecurityHandler {
  constructor(
    readonly configuration: ApiKeySecurityScheme & ApiKeySecurityValues
  ) {}

  handle(
    _response: HttpResponse,
    _resourceRequestParameters: RequestParameters,
    _cache: AuthCache
  ): AffterHookAuthResult {
    return { kind: 'continue' };
  }

  prepare(parameters: RequestParameters): BeforeHookAuthResult {
    let body: Variables | undefined = parameters.body;
    const headers: Record<string, string> = parameters.headers;
    const pathParameters = parameters.pathParameters ?? {};
    const queryAuth: Record<string, string> = {};

    const name = this.configuration.name || DEFAULT_AUTHORIZATION_HEADER_NAME;

    switch (this.configuration.in) {
      case ApiKeyPlacement.HEADER:
        headers[name] = this.configuration.apikey;
        break;

      case ApiKeyPlacement.BODY:
        body = applyApiKeyAuthInBody(
          body || {},
          name.startsWith('/') ? name.slice(1).split('/') : [name],
          this.configuration.apikey
        );
        break;

      case ApiKeyPlacement.PATH:
        pathParameters[name] = this.configuration.apikey;
        break;

      case ApiKeyPlacement.QUERY:
        queryAuth[name] = this.configuration.apikey;
        break;
    }

    const request: RequestParameters = {
      ...parameters,
      headers,
      pathParameters,
      queryParameters: queryAuth,
      body,
    };

    return {
      kind: 'modify',
      newArgs: [request],
    };
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
