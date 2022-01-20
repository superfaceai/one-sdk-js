import { HttpSecurityRequirement } from '@superfaceai/ast';
import createDebug from 'debug';
import { inspect } from 'util';

import { USER_AGENT } from '../../../index';
import {
  eventInterceptor,
  Events,
  Interceptable,
  InterceptableMetadata,
} from '../../../lib/events';
import { recursiveKeyList } from '../../../lib/object';
import { UnexpectedError } from '../../errors';
import { missingPathReplacementError } from '../../errors.helpers';
import {
  getValue,
  NonPrimitive,
  Variables,
  variablesToStrings,
} from '../variables';
import { FetchInstance } from './interfaces';
import {
  AuthCache,
  HttpRequest,
  RequestParameters,
  SecurityConfiguration,
} from './security';
import { registerAuthenticationHooks } from './security/authenticate';
import { prepareRequest } from './security/utils';

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
  const replacements: string[] = [];

  const regex = RegExp('{([^}]*)}', 'g');
  let replacement: RegExpExecArray | null;
  while ((replacement = regex.exec(url)) !== null) {
    replacements.push(replacement[1]);
  }

  const entries = replacements.map<[string, Variables | undefined]>(key => [
    key,
    getValue(parameters, key.split('.')),
  ]);
  const values = Object.fromEntries(entries);
  const missingKeys = replacements.filter(key => values[key] === undefined);

  if (missingKeys.length > 0) {
    const missing = missingKeys;
    const all = replacements;
    const available = recursiveKeyList(parameters ?? {});

    throw missingPathReplacementError(missing, url, all, available);
  }

  const stringifiedValues = variablesToStrings(values);

  for (const param of Object.keys(values)) {
    const replacement = stringifiedValues[param];

    url = url.replace(`{${param}}`, replacement);
  }

  return url;
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

export class HttpClient implements Interceptable {
  public metadata:
    | (InterceptableMetadata & {
        resourceRequest?: RequestParameters;
        previousResponse?: HttpResponse;
      })
    | undefined;

  public events: Events | undefined;

  constructor(
    //TODO: make this nice?
    private fetchInstance: FetchInstance & Interceptable & AuthCache
  ) {
    this.metadata = fetchInstance.metadata;
    //TODO: handle this in some sane way
    if (!this.fetchInstance.events) {
      throw new Error('Missing events');
    }

    this.events = this.fetchInstance.events;
  }

  //This is basicaly just handling authnetication and passing response to metadata
  @eventInterceptor({ eventName: 'request', placement: 'around' })
  //TODO: cache and security should be pass directly to event handler somehow
  private async makeRequest(
    parameters: RequestParameters
  ): Promise<HttpResponse> {
    const request = prepareRequest(parameters);

    //Actual fetch
    const response = await this.fetchRequest(request);

    if (!this.metadata) {
      this.metadata = {};
    }
    this.metadata.previousResponse = response;

    return response;
  }

  private async fetchRequest(request: HttpRequest): Promise<HttpResponse> {
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
        debugSensitive(`\t${headerName}: ${value}`)
      );
      if (request.body !== undefined) {
        debugSensitive(`\n${inspect(request.body, true, 5)}`);
      }
    }
    const response = await this.fetchInstance.fetch(request.url, request);

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

  public async request(
    url: string,
    parameters: {
      method: string;
      headers?: Variables;
      queryParameters?: Variables;
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
    //We register auth hooks
    registerAuthenticationHooks(
      this.events!,
      this.fetchInstance,
      parameters.securityConfiguration || [],
      parameters.securityRequirements || []
    );
    const headers = variablesToStrings(parameters?.headers);
    headers['accept'] = parameters.accept || '*/*';
    headers['user-agent'] ??= USER_AGENT;

    //Prepare resource request
    const resourceRequestParameters: RequestParameters = {
      url,
      baseUrl: parameters.baseUrl,
      integrationParameters: parameters.integrationParameters,
      pathParameters: parameters.pathParameters,
      body: parameters.body,
      contentType: parameters.contentType,
      method: parameters.method,
      headers,
    };
    //Add resource request to (hooks) metadata
    if (!this.metadata) {
      this.metadata = {};
    }
    this.metadata.resourceRequest = resourceRequestParameters;

    return this.makeRequest(resourceRequestParameters);
  }
}
