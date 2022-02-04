import { USER_AGENT } from '../../../index';
import { clone } from '../../../lib';
import { UnexpectedError } from '../..';
import { unsupportedContentType } from '../../errors.helpers';
import { variablesToStrings } from '../variables';
import { createUrl, fetchRequest, HttpResponse } from './http';
import {
  BINARY_CONTENT_REGEXP,
  BINARY_CONTENT_TYPES,
  binaryBody,
  FetchBody,
  FetchInstance,
  FORMDATA_CONTENT,
  formDataBody,
  isBinaryBody,
  isFormDataBody,
  isStringBody,
  isUrlSearchParamsBody,
  JSON_CONTENT,
  stringBody,
  URLENCODED_CONTENT,
  urlSearchParamsBody,
} from './interfaces';
import {
  AuthCache,
  HttpRequest,
  ISecurityHandler,
  RequestParameters,
} from './security';

/**
 * Represents input of pipe filter
 */
export type FilterInput = {
  parameters: RequestParameters;
  request?: HttpRequest;
  response?: HttpResponse;
  fetchInstance: FetchInstance & AuthCache;
  handler?: ISecurityHandler;
};
/**
 * Represents pipe filter which prepares request parameters
 */
export type PrepareFilter = ({
  parameters,
  request,
  response,
  fetchInstance,
  handler,
}: FilterInput) =>
  | {
      kind: 'prepare';
      parameters: RequestParameters;
    }
  | Promise<{
      kind: 'prepare';
      parameters: RequestParameters;
    }>;
/**
 * Represents pipe filter which prepares HttpRequest
 */
export type RequestFilter = ({
  parameters,
  request,
  response,
  fetchInstance,
  handler,
}: FilterInput) =>
  | {
      kind: 'request';
      parameters: RequestParameters;
      request: HttpRequest;
    }
  | Promise<{
      kind: 'request';
      parameters: RequestParameters;
      request: HttpRequest;
    }>;
/**
 * Represents pipe filter which works with http response
 */
export type ResponseFilter = ({
  parameters,
  request,
  response,
  fetchInstance,
  handler,
}: FilterInput) =>
  | {
      kind: 'response';
      parameters: RequestParameters;
      request: HttpRequest;
      response: HttpResponse;
    }
  | Promise<{
      kind: 'response';
      parameters: RequestParameters;
      request: HttpRequest;
      response: HttpResponse;
    }>;

/**
 * Infers pipe return type based on type of the filters
 */
export type PipeReturnType<
  T extends Array<ResponseFilter | PrepareFilter | RequestFilter>
> =
  //Order matters!
  T extends Array<PrepareFilter>
    ? RequestParameters
    : T extends Array<PrepareFilter | RequestFilter>
    ? HttpRequest
    : T extends Array<PrepareFilter | RequestFilter | ResponseFilter>
    ? HttpResponse
    : never;

export async function pipe<
  T extends Array<ResponseFilter | PrepareFilter | RequestFilter>
>(arg: {
  parameters: RequestParameters;
  fetchInstance: FetchInstance & AuthCache;
  handler?: ISecurityHandler;
  filters: T;
  response?: HttpResponse;
  request?: HttpRequest;
}): Promise<PipeReturnType<T>> {
  let request: HttpRequest | undefined;
  let response: HttpResponse | undefined;
  let parameters = clone(arg.parameters);

  for (const fn of arg.filters) {
    const updated = await fn({
      ...arg,
      parameters,
      request,
      response,
    });
    if (updated.kind === 'response') {
      request = updated.request;
      response = updated.response;
    } else if (updated.kind === 'request') {
      request = updated.request;
    }
    parameters = updated.parameters;
  }

  if (response && request) {
    return response as PipeReturnType<T>;
  } else if (request) {
    return request as PipeReturnType<T>;
  }

  return parameters as PipeReturnType<T>;
}

//These filters should be easy to test
export const fetchFilter: ResponseFilter = async ({
  parameters,
  request,
  fetchInstance,
}: FilterInput) => {
  if (!request || !isCompleteHttpRequest(request)) {
    throw new UnexpectedError('Request is not complete', request);
  }

  return {
    kind: 'response',
    parameters,
    request,
    response: await fetchRequest(fetchInstance, request),
  };
};

//TODO: how to auth without keeping the handler instance
export const authenticateFilter: PrepareFilter = async ({
  parameters,
  request,
  response,
  fetchInstance,
  handler,
}: FilterInput) => {
  if (handler) {
    return {
      kind: 'prepare',
      parameters: await handler.authenticate(parameters, fetchInstance),
      request,
      response,
    };
  }

  return {
    kind: 'prepare',
    parameters,
    request,
    response,
  };
};

//TODO: how to auth without keeping the handler instance, naming
//This is handling the cases when we are authenticated but eg. digest credentials expired or oauth access token is no longer valid
export const handleResponseFilter: ResponseFilter = async ({
  parameters,
  request,
  response,
  fetchInstance,
  handler,
}: FilterInput) => {
  //TODO: better error
  if (!request) {
    throw new Error('request is undefined');
  }
  if (!response) {
    throw new Error('response is undefined');
  }
  if (handler && handler.handleResponse) {
    //We get new parameters (with updated auth, also updated cache)
    const authParameters = await handler.handleResponse(
      response,
      parameters,
      fetchInstance
    );
    //We retry the request
    if (authParameters) {
      response = await fetchRequest(fetchInstance, authParameters);
    }
  }

  return { kind: 'response', parameters, request, response };
};

export const prepareRequestFilter: RequestFilter = ({
  parameters,
  request,
  response,
}: {
  parameters: RequestParameters;
  request?: HttpRequest;
  response?: HttpResponse;
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

  //TODO: break this into more functions?
  return {
    kind: 'request',
    parameters,
    request: {
      ...request,
      body: finalBody,
      queryParameters: {
        ...request?.queryParameters,
        ...variablesToStrings(parameters.queryParameters),
      },
      headers: {
        ...request?.headers,
        ...parameters.headers,
      },
      url: createUrl(parameters.url, {
        baseUrl: parameters.baseUrl,
        pathParameters: parameters.pathParameters ?? {},
        integrationParameters: parameters.integrationParameters,
      }),
      method: parameters.method,
    },
    response,
  };
};

export const headersFilter: PrepareFilter = ({
  parameters,
  request,
  response,
}: {
  parameters: RequestParameters;
  request?: HttpRequest;
  response?: HttpResponse;
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
    kind: 'prepare',
    parameters: {
      ...parameters,
      headers,
    },
    request,
    response,
  };
};

function isCompleteHttpRequest(
  input: Partial<HttpRequest>
): input is HttpRequest {
  if (!input.url || typeof input.url !== 'string') {
    return false;
  }
  if (!input.method || typeof input.method !== 'string') {
    return false;
  }
  if (input.headers) {
    if (typeof input.headers !== 'object') {
      return false;
    }
    if (!Object.keys(input.headers).every(key => typeof key === 'string')) {
      return false;
    }

    if (
      !Object.values(input.headers).every(
        value => typeof value === 'string' || Array.isArray(value)
      )
    ) {
      return false;
    }
  }

  if (input.queryParameters) {
    if (typeof input.queryParameters !== 'object') {
      return false;
    }
    if (
      !Object.keys(input.queryParameters).every(key => typeof key === 'string')
    ) {
      return false;
    }

    if (
      !Object.values(input.queryParameters).every(
        value => typeof value === 'string'
      )
    ) {
      return false;
    }
  }

  if (
    input.body &&
    !(
      isStringBody(input.body) ||
      isFormDataBody(input.body) ||
      isUrlSearchParamsBody(input.body) ||
      isBinaryBody(input.body)
    )
  ) {
    return false;
  }

  return true;
}
