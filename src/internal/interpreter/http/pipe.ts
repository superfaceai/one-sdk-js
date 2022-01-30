import { HttpResponse, fetchRequest, createUrl } from './http';
import { USER_AGENT } from '../../../index';
import { unsupportedContentType } from '../../errors.helpers';
import { variablesToStrings } from '../variables';
import {
  FetchInstance,
  JSON_CONTENT,
  URLENCODED_CONTENT,
  FORMDATA_CONTENT,
  BINARY_CONTENT_REGEXP,
  BINARY_CONTENT_TYPES,
  FetchBody,
  stringBody,
  urlSearchParamsBody,
  formDataBody,
  binaryBody,
} from './interfaces';
import {
  AuthCache,
  HttpRequest,
  ISecurityHandler,
  RequestParameters,
} from './security';

/**
 * Represents input of pipe filter which works with http response
 */
export type FetchPipeFilterInput = {
  parameters: RequestParameters;
  request: Partial<HttpRequest>;
  response: HttpResponse | undefined;
  fetchInstance: FetchInstance & AuthCache;
  handler: ISecurityHandler | undefined;
};
/**
 * Represents pipe filter which works with http response
 */
export type FetchPipeFilter = ({
  parameters,
  request,
  response,
  fetchInstance,
  handler,
}: FetchPipeFilterInput) =>
  | Pick<FetchPipeFilterInput, 'request' | 'response'>
  | Promise<Pick<FetchPipeFilterInput, 'request' | 'response'>>;

/**
 * Represents input of pipe filter which only prepares http request
 */
export type PreparePipeFilterInput = {
  parameters: RequestParameters;
  request: Partial<HttpRequest>;
};

/**
 * Represents pipe filter which only prepares http request
 */
export type PreparePipeFilter = ({
  parameters,
  request,
}: PreparePipeFilterInput) =>
  | Pick<PreparePipeFilterInput, 'request'>
  | Promise<Pick<PreparePipeFilterInput, 'request'>>;

/**
 * Represents input of pipe which only prepares http request
 */
export type PreparePipeInput = {
  parameters: RequestParameters;
  fns: PreparePipeFilter[];
};

/**
 * Represents output of pipe which only prepares http request
 */
export type PreparePipeOutput = HttpRequest;

/**
 * Represents pipe filter which only prepares http request
 */
export type PreparePipe = ({
  parameters,
  fns,
}: PreparePipeInput) => PreparePipeOutput;

/**
 * Represents pipe filter input which works with http response
 */
export type FetchPipeInput = {
  parameters: RequestParameters;
  fetchInstance: FetchInstance & AuthCache;
  handler: ISecurityHandler | undefined;
  fns: (FetchPipeFilter | PreparePipeFilter)[];
};

/**
 * Represents pipe filter output which works with http response
 */
export type FetchPipeOutput = Promise<HttpResponse>;

/**
 * Represents pipe filter which works with http response
 */
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
