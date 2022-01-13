import {
  ApiKeySecurityScheme,
  ApiKeySecurityValues,
  ApiKeyPlacement,
} from '@superfaceai/ast';
import { apiKeyInBodyError } from '../../../../errors.helpers';
import { Variables } from '../../../variables';
import {
  DEFAULT_AUTHORIZATION_HEADER_NAME,
  ISecurityHandler,
  RequestContext,
} from '../../security';

export class ApiKeyHandler implements ISecurityHandler {
  constructor(
    readonly configuration: ApiKeySecurityScheme & ApiKeySecurityValues
  ) {}

  prepare(context: RequestContext): void {
    const name = this.configuration.name || DEFAULT_AUTHORIZATION_HEADER_NAME;

    switch (this.configuration.in) {
      case ApiKeyPlacement.HEADER:
        context.headers[name] = this.configuration.apikey;
        break;

      case ApiKeyPlacement.BODY:
        context.requestBody = applyApiKeyAuthInBody(
          context.requestBody ?? {},
          name.startsWith('/') ? name.slice(1).split('/') : [name],
          this.configuration.apikey
        );
        break;

      case ApiKeyPlacement.PATH:
        context.pathParameters[name] = this.configuration.apikey;
        break;

      case ApiKeyPlacement.QUERY:
        context.queryAuth[name] = this.configuration.apikey;

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
