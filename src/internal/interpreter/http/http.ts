import {
  HttpScheme,
  HttpSecurityRequirement,
  SecurityType,
} from '@superfaceai/ast';
import createDebug from 'debug';
import { inspect } from 'util';

import { USER_AGENT } from '../../../index';
import { recursiveKeyList } from '../../../lib/object';
import { UnexpectedError } from '../../errors';
import {
  missingPathReplacementError,
  missingSecurityValuesError,
  unsupportedContentType,
} from '../../errors.helpers';
import {
  getValue,
  NonPrimitive,
  Variables,
  variablesToStrings,
} from '../variables';
import {
  BINARY_CONTENT_REGEXP,
  BINARY_CONTENT_TYPES,
  binaryBody,
  FetchBody,
  FetchInstance,
  FORMDATA_CONTENT,
  formDataBody,
  JSON_CONTENT,
  stringBody,
  URLENCODED_CONTENT,
  urlSearchParamsBody,
} from './interfaces';
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
import { OAuthHandler } from './security/oauth';

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
//TODO: not sure if this can be exported or shoul be passed as argument
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
    const requestParameters: RequestParameters = {
      url,
      ...parameters,
      headers: variablesToStrings(parameters?.headers),
    };

    //TODO: change name? Something like requestPipe?
    return pipe({
      parameters: requestParameters,
      fetchInstance: this.fetchInstance,
      handler: getSecurityHandler(
        requestParameters.securityConfiguration,
        requestParameters.securityRequirements
      ),
      fns: [
        pipeHeaders,
        pipeBody,
        pipeQueryParameters,
        pipeMethod,
        pipeUrl,
        pipeAuthenticate,
        pipeFetch,
        pipeResponse,
      ],
    });
  }
}

function getSecurityHandler(
  securityConfiguration?: SecurityConfiguration[],
  securityRequirements?: HttpSecurityRequirement[]
): ISecurityHandler | undefined {
  let handler: ISecurityHandler | undefined = undefined;
  for (const requirement of securityRequirements ?? []) {
    const configuration = (securityConfiguration ?? []).find(
      configuration => configuration.id === requirement.id
    );
    if (configuration === undefined) {
      throw missingSecurityValuesError(requirement.id);
    }
    if (configuration.type === SecurityType.APIKEY) {
      handler = new ApiKeyHandler(configuration);
    } else if (configuration.type === SecurityType.OAUTH) {
      handler = new OAuthHandler(configuration);
    } else if (configuration.scheme === HttpScheme.DIGEST) {
      handler = new DigestHandler(configuration);
    } else {
      handler = new HttpHandler(configuration);
    }
  }

  return handler;
}

//TODO: move this to new file.
//Represents pipe helper function
export type FetchPipeFilterInput = {
  parameters: RequestParameters;
  request: Partial<HttpRequest>;
  response: HttpResponse | undefined;
  fetchInstance: FetchInstance & AuthCache;
  handler: ISecurityHandler | undefined;
};
export type FetchPipeFilter = ({
  parameters,
  request,
  response,
  fetchInstance,
  handler,
}: FetchPipeFilterInput) =>
  | Pick<FetchPipeFilterInput, 'request' | 'response'>
  | Promise<Pick<FetchPipeFilterInput, 'request' | 'response'>>;
//Prepare pipe

export type PreparePipeFilterInput = {
  parameters: RequestParameters;
  request: Partial<HttpRequest>;
  // response: HttpResponse | undefined;
  // handler: ISecurityHandler | undefined;
};

export type PreparePipeFilter = ({
  parameters,
  request,
}: // response,
// fetchInstance,
// handler,
PreparePipeFilterInput) =>
  | Pick<PreparePipeFilterInput, 'request'>
  | Promise<Pick<PreparePipeFilterInput, 'request'>>;

export type PreparePipeInput = {
  // kind: 'prepare';
  parameters: RequestParameters;
  fns: PreparePipeFilter[];
};

export type PreparePipeOutput = HttpRequest;

export type PreparePipe = ({
  parameters,
  fns,
}: PreparePipeInput) => PreparePipeOutput;

export type FetchPipeInput = {
  parameters: RequestParameters;
  fetchInstance: FetchInstance & AuthCache;
  handler: ISecurityHandler | undefined;
  fns: (FetchPipeFilter | PreparePipeFilter)[];
};

export type FetchPipeOutput = Promise<HttpResponse>;

export type FetchPipe = ({
  parameters,
  fns,
  fetchInstance,
  handler,
}: FetchPipeInput) => FetchPipeOutput;

type PipeReturnType<T extends PreparePipeInput | FetchPipeInput> =
  T extends FetchPipeInput
    ? HttpResponse
    : T extends PreparePipeInput
    ? HttpRequest
    : never;

export async function pipe<T extends PreparePipeInput | FetchPipeInput>(
  arg: T
): Promise<PipeReturnType<T>> {
  //We are just preparing the request (used in handlers)
  if (!('fetchInstance' in arg)) {
    let request: Partial<HttpRequest> = {};

    for (const fn of arg.fns) {
      const updated = await fn({
        ...arg,
        request,
      });
      request = mergeRequests(request, updated.request);
    }

    return request as PipeReturnType<T>;
  } else {
    //We are actually getting the response
    let request: Partial<HttpRequest> = {};
    let response: HttpResponse | undefined;

    for (const fn of arg.fns) {
      const updated = await (fn({
        ...arg,
        request,
        response,
      }) as ReturnType<FetchPipeFilter | PreparePipeFilter>);

      request = mergeRequests(request, updated.request);
      if ('response' in updated) response = updated.response;
    }

    //TODO:
    if (!response) {
      throw new Error('Response undefined');
    }

    return response as PipeReturnType<T>;
  }
}

export const mergeRequests = (
  left: Partial<HttpRequest>,
  right: Partial<HttpRequest>
): Partial<HttpRequest> => {
  //TODO: maybe use some better way of merging
  return {
    ...left,
    ...right,
  };
};

//These fns should be easy to test
export const pipeFetch: FetchPipeFilter = async ({
  parameters,
  request,
  fetchInstance,
}: FetchPipeFilterInput) => {
  return {
    parameters,
    request,
    //TODO: check if request is complete
    response: await fetchRequest(fetchInstance, request as HttpRequest),
  };
};

//TODO: how to auth without keeping the handler instance
export const pipeAuthenticate: FetchPipeFilter = async ({
  parameters,
  request,
  response,
  fetchInstance,
  handler,
}: FetchPipeFilterInput) => {
  if (handler) {
    const authRequest = await handler.authenticate(parameters, fetchInstance);

    return {
      parameters,
      request: mergeRequests(request, authRequest),
      response,
    };
  }

  return {
    parameters,
    request,
    response,
  };
};

//TODO: how to auth without keeping the handler instance, naming
//This is handling the cases when we are authenticated but eg. digest credentials expired or oauth access token is no longer valid
export const pipeResponse: FetchPipeFilter = async ({
  parameters,
  request,
  response,
  fetchInstance,
  handler,
}: FetchPipeFilterInput) => {
  //TODO: better error
  if (!response) {
    throw new Error('response is undefined');
  }
  if (handler && handler.handleResponse) {
    //We get new parameters (with updated auth, also updated cache)
    const authRequest = await handler.handleResponse(
      response,
      parameters,
      fetchInstance
    );
    //We retry the request
    if (authRequest) {
      response = await fetchRequest(fetchInstance, authRequest);
    }
  }

  return { parameters, request, response };
};

export const pipeHeaders: PreparePipeFilter = ({
  parameters,
  request,
}: {
  parameters: RequestParameters;
  request: Partial<HttpRequest>;
}) => {
  const headers: Record<string, string> = parameters.headers || {};
  headers['accept'] = parameters.accept || '*/*';
  headers['user-agent'] ??= USER_AGENT;
  if (parameters.contentType === JSON_CONTENT) {
    headers['Content-Type'] ??= JSON_CONTENT;
  } else if (parameters.contentType === URLENCODED_CONTENT) {
    headers['Content-Type'] ??= URLENCODED_CONTENT;
  } else if (parameters.contentType === FORMDATA_CONTENT) {
    headers['Content-Type'] ??= FORMDATA_CONTENT;
  } else if (
    parameters.contentType &&
    BINARY_CONTENT_REGEXP.test(parameters.contentType)
  ) {
    headers['Content-Type'] ??= parameters.contentType;
  } else {
    const supportedTypes = [
      JSON_CONTENT,
      URLENCODED_CONTENT,
      FORMDATA_CONTENT,
      ...BINARY_CONTENT_TYPES,
    ];

    throw unsupportedContentType(parameters.contentType ?? '', supportedTypes);
  }

  return {
    parameters,
    request: {
      ...request,
      headers,
    },
  };
};

export const pipeBody: PreparePipeFilter = ({
  parameters,
  request,
}: {
  parameters: RequestParameters;
  request: Partial<HttpRequest>;
}) => {
  let finalBody: FetchBody | undefined;
  if (parameters.body) {
    if (parameters.contentType === JSON_CONTENT) {
      finalBody = stringBody(JSON.stringify(parameters.body));
    } else if (parameters.contentType === URLENCODED_CONTENT) {
      finalBody = urlSearchParamsBody(variablesToStrings(parameters.body));
    } else if (parameters.contentType === FORMDATA_CONTENT) {
      finalBody = formDataBody(variablesToStrings(parameters.body));
    } else if (
      parameters.contentType &&
      BINARY_CONTENT_REGEXP.test(parameters.contentType)
    ) {
      let buffer: Buffer;
      if (Buffer.isBuffer(parameters.body)) {
        buffer = parameters.body;
      } else {
        //coerce to string then buffer
        buffer = Buffer.from(String(parameters.body));
      }
      finalBody = binaryBody(buffer);
    } else {
      const supportedTypes = [
        JSON_CONTENT,
        URLENCODED_CONTENT,
        FORMDATA_CONTENT,
        ...BINARY_CONTENT_TYPES,
      ];

      throw unsupportedContentType(
        parameters.contentType ?? '',
        supportedTypes
      );
    }
  }

  return {
    parameters,
    request: {
      ...request,
      body: finalBody,
    },
  };
};

export const pipeQueryParameters: PreparePipeFilter = ({
  parameters,
  request,
}: {
  parameters: RequestParameters;
  request: Partial<HttpRequest>;
}) => {
  return {
    parameters,
    request: {
      ...request,
      queryParameters: variablesToStrings(parameters.queryParameters),
    },
  };
};

export const pipeMethod: PreparePipeFilter = ({
  parameters,
  request,
}: {
  parameters: RequestParameters;
  request: Partial<HttpRequest>;
}) => {
  return {
    parameters,
    request: {
      ...request,
      method: parameters.method,
    },
  };
};

export const pipeUrl: PreparePipeFilter = ({
  parameters,
  request,
}: {
  parameters: RequestParameters;
  request: Partial<HttpRequest>;
}) => {
  return {
    parameters,
    request: {
      ...request,
      url: createUrl(parameters.url, {
        baseUrl: parameters.baseUrl,
        pathParameters: parameters.pathParameters ?? {},
        integrationParameters: parameters.integrationParameters,
      }),
    },
  };
};
