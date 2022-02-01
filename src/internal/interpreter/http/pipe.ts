import { USER_AGENT } from '../../../index';
import { UnexpectedError } from '../..';
import { unsupportedContentType } from '../../errors.helpers';
import { mergeVariables, variablesToStrings } from '../variables';
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
 * This kind of filter should be able to return same result when ran for the forst time and when ran mutiple times (with same inputs)
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

    if (!response) {
      throw new Error(
        'Final response in pipe undefined - empty function array?'
      );
    }

    return response as PipeReturnType<T>;
  }
}

//These fns should be easy to test
export const pipeFetch: FetchPipeFilter = async ({
  parameters,
  request,
  fetchInstance,
}: FetchPipeFilterInput) => {
  if (!isCompleteHttpRequest(request)) {
    throw new UnexpectedError('Request is not complete', request);
  }

  return {
    parameters,
    request,
    response: await fetchRequest(fetchInstance, request),
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
      //TODO: this can be problamatic - in cases when we actually send something in body and also there is apiKey in the body we must be able to resolve this.
      //Simple solution is to leave request handlig on the security handler - it hase acces to parameters so it is capable to do that. Affter that we would just update the original request
      //request: authRequest,
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
//TODO: this should be able to resolve and merge existing body in request
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
      queryParameters: {
        ...request.queryParameters,
        ...variablesToStrings(parameters.queryParameters),
      },
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

//TODO: We should try to minimalize need for this
const mergeRequests = (
  left: Partial<HttpRequest>,
  right: Partial<HttpRequest>
): Partial<HttpRequest> => {
  //TODO: maybe use some better way of merging
  const result: Partial<HttpRequest> = { ...left, ...right };
  //Headers
  if (left.headers && right.headers) {
    result.headers = mergeVariables(left.headers, right.headers) as Record<
      string,
      string | string[]
    >;
  }

  //Query
  if (left.queryParameters && right.queryParameters) {
    result.queryParameters = mergeVariables(
      left.queryParameters,
      right.queryParameters
    ) as Record<string, string>;
  }

  if (left.body && right.body) {
    if (left.body._type !== right.body._type) {
      throw new UnexpectedError(
        'Unable to merge request bodies - body types not matching',
        { left, right }
      );
    }
    if (isStringBody(left.body) && isStringBody(right.body)) {
      result.body = stringBody(
        JSON.stringify({
          ...JSON.parse(left.body.data),
          ...JSON.parse(right.body.data),
        })
      );
    }

    if (isUrlSearchParamsBody(left.body) && isUrlSearchParamsBody(right.body)) {
      result.body = urlSearchParamsBody({
        ...left.body.data,
        ...right.body.data,
      });
    }

    if (isFormDataBody(left.body) && isFormDataBody(right.body)) {
      result.body = formDataBody({ ...left.body.data, ...right.body.data });
    }

    if (isBinaryBody(left.body) && isBinaryBody(right.body)) {
      throw new UnexpectedError('Not implemented yet');
    }
  }

  return result;
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
