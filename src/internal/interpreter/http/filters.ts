import { USER_AGENT } from '../../../index';
import { pipe } from '../../../lib/pipe/pipe';
import { MaybePromise } from '../../../lib/types';
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
 * Represents input of pipe filter which works with http response
 */
export type FilterInputOutput = {
  parameters: RequestParameters;
  request?: Partial<HttpRequest>;
  response?: HttpResponse;
};

export type FilterInputWithResponse = FilterInputOutput & {
  response: HttpResponse;
};

export type FilterInputWithRequest = FilterInputOutput & {
  request: HttpRequest;
};

/**
 * Represents pipe filter which works with http response
 */
export type Filter = (
  input: FilterInputOutput
) => MaybePromise<FilterInputOutput>;

export type FilterWithResponse = (
  input: FilterInputWithResponse
) => MaybePromise<FilterInputOutput>;

export type FilterWithRequest = (
  input: FilterInputWithRequest
) => MaybePromise<FilterInputOutput>;

/**
 * Represents pipe input
 */
export type PipeInput = {
  filters: Filter[];
  initial: FilterInputOutput;
};

/**
 * Asserts that given filter gets called with request present in input
 */
export const withRequest = (filter: FilterWithRequest): Filter => {
  return async ({ response, request, parameters }: FilterInputOutput) => {
    if (request === undefined || !isCompleteHttpRequest(request)) {
      throw new UnexpectedError('Request is not complete', request);
    }

    return filter({ response, request, parameters });
  };
};

/**
 * Asserts that given filter gets called with response present in input
 */
export const withResponse = (filter: FilterWithResponse): Filter => {
  return async ({ response, request, parameters }: FilterInputOutput) => {
    if (response === undefined) {
      throw new UnexpectedError('Response in HTTP Request is undefined.');
    }

    return filter({ response, request, parameters });
  };
};

export const fetchFilter: (
  fetchInstance: FetchInstance & AuthCache
) => FilterWithRequest =
  fetchInstance =>
  async ({ parameters, request }: FilterInputWithRequest) => {
    return {
      parameters,
      request,
      response: await fetchRequest(fetchInstance, request),
    };
  };

export const authenticateFilter: (handler?: ISecurityHandler) => Filter =
  handler =>
  async ({ parameters, request, response }: FilterInputOutput) => {
    if (handler !== undefined) {
      return {
        parameters: await handler.authenticate(parameters),
        request,
        response,
      };
    }

    return {
      parameters,
      request,
      response,
    };
  };

// This is handling the cases when we are authenticated but eg. digest credentials expired or OAuth access token is no longer valid
export const handleResponseFilter: (
  fetchInstance: FetchInstance & AuthCache,
  handler?: ISecurityHandler
) => FilterWithResponse =
  (fetchInstance, handler) =>
  async ({ parameters, request, response }: FilterInputWithResponse) => {
    if (handler?.handleResponse !== undefined) {
      // We get new parameters (with updated auth, also updated cache)
      const authRequest = await handler.handleResponse(response, parameters);
      // We retry the request
      if (authRequest !== undefined) {
        response = await fetchRequest(fetchInstance, authRequest);
      }
    }

    return { parameters, request, response };
  };

export const urlFilter: Filter = ({
  parameters,
  request,
  response,
}: FilterInputOutput) => {
  const url = createUrl(parameters.url, {
    baseUrl: parameters.baseUrl,
    pathParameters: parameters.pathParameters ?? {},
    integrationParameters: parameters.integrationParameters,
  });

  return {
    parameters,
    request: {
      ...(request ?? {}),
      url,
    },
    response,
  };
};

export const bodyFilter: Filter = ({
  parameters,
  request,
  response,
}: FilterInputOutput) => {
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
        // convert to string then buffer
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
      ...(request ?? {}),
      body: finalBody,
    },
    response,
  };
};

export const queryParametersFilter: Filter = ({
  parameters,
  response,
  request,
}: FilterInputOutput) => {
  const queryParameters = {
    ...request?.queryParameters,
    ...variablesToStrings(parameters.queryParameters),
  };

  return {
    parameters,
    response,
    request: {
      ...(request ?? {}),
      queryParameters,
    },
  };
};

export const methodFilter: Filter = ({
  parameters,
  request,
  response,
}: FilterInputOutput) => {
  const method = parameters.method;

  return {
    parameters,
    request: {
      ...(request ?? {}),
      method,
    },
    response,
  };
};

export const headersFilter: Filter = ({
  parameters,
  request,
  response,
}: FilterInputOutput) => {
  const headers: Record<string, string> = parameters.headers || {};
  headers['accept'] = parameters.accept || '*/*';
  headers['user-agent'] ??= USER_AGENT;
  if (parameters.contentType === JSON_CONTENT) {
    headers['content-type'] ??= JSON_CONTENT;
  } else if (parameters.contentType === URLENCODED_CONTENT) {
    headers['content-type'] ??= URLENCODED_CONTENT;
  } else if (parameters.contentType === FORMDATA_CONTENT) {
    headers['content-type'] ??= FORMDATA_CONTENT;
  } else if (
    parameters.contentType !== undefined &&
    BINARY_CONTENT_REGEXP.test(parameters.contentType)
  ) {
    headers['Content-Type'] ??= parameters.contentType;
  } else {
    if (parameters.body !== undefined) {
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
      headers: {
        ...request?.headers,
        ...headers,
      },
    },
    response,
  };
};

export const prepareRequestFilter: Filter = async input => {
  return pipe(
    input,
    urlFilter,
    bodyFilter,
    queryParametersFilter,
    methodFilter,
    headersFilter
  );
};

export function isCompleteHttpRequest(
  input: Partial<HttpRequest>
): input is HttpRequest {
  if (typeof input.url !== 'string') {
    return false;
  }

  if (typeof input.method !== 'string') {
    return false;
  }

  if (input.headers !== undefined) {
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

  if (input.queryParameters !== undefined) {
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
    input.body !== undefined &&
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
