import {
  HttpScheme,
  HttpSecurityRequirement,
  SecurityType,
} from '@superfaceai/ast';
import createDebug from 'debug';
import { inspect } from 'util';

import { recursiveKeyList } from '../../../lib/object';
import { pipe } from '../../../lib/pipe/pipe';
import { UnexpectedError } from '../../errors';
import {
  missingPathReplacementError,
  missingSecurityValuesError,
} from '../../errors.helpers';
import {
  getValue,
  NonPrimitive,
  Variables,
  variablesToStrings,
  variableToString,
} from '../variables';
import {
  authenticateFilter,
  fetchFilter,
  handleResponseFilter,
  prepareRequestFilter,
  withRequest,
  withResponse,
} from './filters';
import { FetchInstance } from './interfaces';
import {
  ApiKeyHandler,
  AuthCache,
  DigestHandler,
  HttpHandler,
  HttpRequest,
  ISecurityHandler,
  RequestParameters,
  SecurityConfiguration,
} from './security';

const debug = createDebug('superface:http');
const debugSensitive = createDebug('superface:http:sensitive');
debugSensitive(
  `
WARNING: YOU HAVE ALLOWED LOGGING SENSITIVE INFORMATION.
THIS LOGGING LEVEL DOES NOT PREVENT LEAKING SECRETS AND SHOULD NOT BE USED IF THE LOGS ARE GOING TO BE SHARED.
CONSIDER DISABLING SENSITIVE INFORMATION LOGGING BY APPENDING THE DEBUG ENVIRONMENT VARIABLE WITH ",-*:sensitive".
`
);

export interface HttpResponse {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  debug: {
    request: {
      headers: Record<string, string>;
      url: string;
      body: unknown;
    };
  };
}

export enum NetworkErrors {
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
}

function replaceParameters(url: string, parameters: NonPrimitive) {
  let result = '';

  let lastIndex = 0;
  const allKeys: string[] = [];
  const missingKeys: string[] = [];

  const regex = RegExp('{([^}]*)}', 'g');
  for (const match of url.matchAll(regex)) {
    const start = match.index;
    // Why can this be undefined?
    if (start === undefined) {
      throw new UnexpectedError('Invalid regex match state - missing start index');
    }

    const end = start + match[0].length;
    const key = match[1].trim();
    const value = getValue(parameters, key.split('.'));

    allKeys.push(key);
    if (value === undefined) {
      missingKeys.push(key);
      continue;
    }

    result += url.slice(lastIndex, start);
    result += variableToString(value);
    lastIndex = end;
  }
  result += url.slice(lastIndex);

  if (missingKeys.length > 0) {
    const available = recursiveKeyList(parameters ?? {});

    throw missingPathReplacementError(missingKeys, url, allKeys, available);
  }

  return result;
}

export const createUrl = (
  inputUrl: string,
  parameters: {
    baseUrl: string;
    pathParameters?: NonPrimitive;
    integrationParameters?: Record<string, string>;
  }
): string => {
  const baseUrl = replaceParameters(
    parameters.baseUrl,
    parameters.integrationParameters ?? {}
  );

  if (inputUrl === '') {
    return baseUrl;
  }
  const isRelative = /^\/[^/]/.test(inputUrl);
  if (!isRelative) {
    throw new UnexpectedError('Expected relative url, but received absolute!');
  }

  const url = replaceParameters(inputUrl, parameters.pathParameters ?? {});

  return baseUrl.replace(/\/+$/, '') + url;
};

export async function fetchRequest(
  fetchInstance: FetchInstance,
  request: HttpRequest
): Promise<HttpResponse> {
  debug('Executing HTTP Call');
  // secrets might appear in headers, url path, query parameters or body
  if (debugSensitive.enabled) {
    const hasSearchParams =
      Object.keys(request.queryParameters || {}).length > 0;
    const searchParams = new URLSearchParams(request.queryParameters);
    debugSensitive(
      '\t%s %s%s HTTP/1.1',
      request.method || 'UNKNOWN METHOD',
      request.url,
      hasSearchParams ? '?' + searchParams.toString() : ''
    );
    Object.entries(request.headers || {}).forEach(([headerName, value]) =>
      debugSensitive(
        `\t${headerName}: ${Array.isArray(value) ? value.join(', ') : value}`
      )
    );
    if (request.body !== undefined) {
      debugSensitive(`\n${inspect(request.body, true, 5)}`);
    }
  }

  const response = await fetchInstance.fetch(request.url, request);

  debug('Received response');
  if (debugSensitive.enabled) {
    debugSensitive(`\tHTTP/1.1 ${response.status} ${response.statusText}`);
    Object.entries(response.headers).forEach(([headerName, value]) =>
      debugSensitive(`\t${headerName}: ${value}`)
    );
    debugSensitive('\n\t%j', response.body);
  }

  const headers: Record<string, string> = {};
  Object.entries(request.headers ?? {}).forEach(([key, value]) => {
    headers[key] = Array.isArray(value) ? value.join(' ') : value;
  });

  return {
    statusCode: response.status,
    body: response.body,
    headers: response.headers,
    debug: {
      request: {
        url: request.url,
        headers,
        body: request.body,
      },
    },
  };
}

export class HttpClient {
  constructor(private fetchInstance: FetchInstance & AuthCache) {}

  public async request(
    url: string,
    parameters: {
      method: string;
      headers?: Variables;
      queryParameters?: NonPrimitive;
      body?: Variables;
      contentType?: string;
      accept?: string;
      securityRequirements?: HttpSecurityRequirement[];
      securityConfiguration?: SecurityConfiguration[];
      baseUrl: string;
      pathParameters?: NonPrimitive;
      integrationParameters?: Record<string, string>;
    }
  ): Promise<HttpResponse> {
    const requestParameters: RequestParameters = {
      url,
      ...parameters,
      headers: variablesToStrings(parameters?.headers),
    };

    const handler = createSecurityHandler(
      this.fetchInstance,
      requestParameters.securityConfiguration,
      requestParameters.securityRequirements
    );

    const result = await pipe(
      {
        parameters: requestParameters,
      },
      authenticateFilter(handler),
      prepareRequestFilter,
      withRequest(fetchFilter(this.fetchInstance)),
      withResponse(handleResponseFilter(this.fetchInstance, handler))
    );

    if (result.response === undefined) {
      throw new UnexpectedError('Response is undefined');
    }

    return result.response;
  }
}

function createSecurityHandler(
  fetchInstance: FetchInstance & AuthCache,
  securityConfiguration: SecurityConfiguration[] = [],
  securityRequirements: HttpSecurityRequirement[] = []
): ISecurityHandler | undefined {
  let handler: ISecurityHandler | undefined = undefined;
  for (const requirement of securityRequirements) {
    const configuration = securityConfiguration.find(
      configuration => configuration.id === requirement.id
    );
    if (configuration === undefined) {
      throw missingSecurityValuesError(requirement.id);
    }
    if (configuration.type === SecurityType.APIKEY) {
      handler = new ApiKeyHandler(configuration);
    } else if (configuration.scheme === HttpScheme.DIGEST) {
      handler = new DigestHandler(configuration, fetchInstance);
    } else {
      handler = new HttpHandler(configuration);
    }
  }

  return handler;
}
