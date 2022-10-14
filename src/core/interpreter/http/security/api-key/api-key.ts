import type {
  ApiKeySecurityScheme,
  ApiKeySecurityValues,
} from '@superfaceai/ast';
import { ApiKeyPlacement } from '@superfaceai/ast';

import type { ILogger, LogFunction } from '../../../../../interfaces';
import type { Variables } from '../../../../../lib';
import { isFile } from '../../../../../lib';
import { apiKeyInBodyError } from '../../../../errors';
import type {
  AuthenticateRequestAsync,
  ISecurityHandler,
  RequestParameters,
} from '../interfaces';
import { DEFAULT_AUTHORIZATION_HEADER_NAME } from '../interfaces';

const DEBUG_NAMESPACE = 'http:api-key-handler';

export class ApiKeyHandler implements ISecurityHandler {
  private log?: LogFunction;

  constructor(
    public readonly configuration: ApiKeySecurityScheme & ApiKeySecurityValues,
    logger?: ILogger
  ) {
    this.log = logger?.log(DEBUG_NAMESPACE);
    this.log?.('Initialized api key authentization handler');
  }

  public authenticate: AuthenticateRequestAsync = async (
    parameters: RequestParameters
  ) => {
    let body: Variables | undefined = parameters.body;
    const headers: Record<string, string> = parameters.headers ?? {};
    const pathParameters = parameters.pathParameters ?? {};
    const queryParameters = parameters.queryParameters ?? {};

    const name = this.configuration.name ?? DEFAULT_AUTHORIZATION_HEADER_NAME;

    switch (this.configuration.in) {
      case ApiKeyPlacement.HEADER:
        this.log?.('Setting api key to header');
        headers[name] = this.configuration.apikey;
        break;

      case ApiKeyPlacement.BODY:
        this.log?.('Setting api key to body');
        body = applyApiKeyAuthInBody(
          body ?? {},
          name.startsWith('/') ? name.slice(1).split('/') : [name],
          this.configuration.apikey
        );
        break;

      case ApiKeyPlacement.PATH:
        this.log?.('Setting api key to path');
        pathParameters[name] = this.configuration.apikey;
        break;

      case ApiKeyPlacement.QUERY:
        this.log?.('Setting api key to query');
        queryParameters[name] = this.configuration.apikey;
        break;
    }

    return {
      ...parameters,
      headers,
      pathParameters,
      queryParameters,
      body,
    };
  };
}

function applyApiKeyAuthInBody(
  requestBody: Variables,
  referenceTokens: string[],
  apikey: string,
  visitedReferenceTokens: string[] = []
): Variables {
  const valueLocation = visitedReferenceTokens.length
    ? `value at /${visitedReferenceTokens.join('/')}`
    : 'body';

  if (typeof requestBody !== 'object' || Array.isArray(requestBody)) {
    const bodyType = Array.isArray(requestBody) ? 'Array' : typeof requestBody;

    throw apiKeyInBodyError(valueLocation, bodyType);
  }

  if (isFile(requestBody)) {
    throw apiKeyInBodyError(valueLocation, 'File');
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
