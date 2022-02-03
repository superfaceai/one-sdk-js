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
 * Represents input of pipe filter which works with http response
 */
export type FilterInput = {
  parameters: RequestParameters;
  request?: HttpRequest;
  response?: HttpResponse;
  fetchInstance: FetchInstance & AuthCache;
  handler?: ISecurityHandler;
};
/**
 * Represents pipe filter which works with http response
 */
export type Filter = ({
  parameters,
  request,
  response,
  fetchInstance,
  handler,
}: FilterInput) =>
  | {
      parameters: RequestParameters;
      request?: HttpRequest;
      response?: HttpResponse;
    }
  | Promise<{
      parameters: RequestParameters;
      request?: HttpRequest;
      response?: HttpResponse;
    }>;

/**
 * Represents pipe input
 */
export type PipeInput = {
  parameters: RequestParameters;
  fetchInstance: FetchInstance & AuthCache;
  handler?: ISecurityHandler;
  filters: Filter[];
  response?: HttpResponse;
  request?: HttpRequest;
};

//TODO: two problems here:
//1) merging of request
//2) pipe retrun type
export async function pipe(
  arg: PipeInput
): Promise<// | { parameters: RequestParameters, request: undefined, response: undefined }
// | { parameters: RequestParameters; request: HttpRequest, response: undefined }
// | {
{
  parameters: RequestParameters;
  request?: HttpRequest;
  response?: HttpResponse;
}> {
  let request: HttpRequest | undefined;
  let response: HttpResponse | undefined;
  let parameters = clone(arg.parameters);

  let stage: 'prepare' | 'request' | 'response' = 'prepare';

  for (const fn of arg.filters) {
    const updated = await fn({
      ...arg,
      parameters,
      request,
      response,
    });

    parameters = updated.parameters;

    if (updated.request) {
      stage = 'request';
      request = updated.request;
    }
    if (updated.response) {
      stage = 'response';
      response = updated.response;
    }
  }
  if (stage === 'prepare') {
    return { parameters, request: undefined, response: undefined };
  } else if (stage === 'request') {
    return { parameters, request, response: undefined };
  } else {
    return { parameters, request, response };
  }
}

//These filters should be easy to test
export const fetchFilter: Filter = async ({
  parameters,
  request,
  fetchInstance,
}: FilterInput) => {
  if (!request || !isCompleteHttpRequest(request)) {
    throw new UnexpectedError('Request is not complete', request);
  }

  return {
    parameters,
    request,
    response: await fetchRequest(fetchInstance, request),
  };
};

//TODO: how to auth without keeping the handler instance
export const authenticateFilter: Filter = async ({
  parameters,
  request,
  response,
  fetchInstance,
  handler,
}: FilterInput) => {
  if (handler) {
    const authRequest = await handler.authenticate(parameters, fetchInstance);

    return {
      parameters,
      request: authRequest,
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
export const handleResponseFilter: Filter = async ({
  parameters,
  request,
  response,
  fetchInstance,
  handler,
}: FilterInput) => {
  //TODO: better error
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

  return { parameters, request, response };
};

export const prepareRequestFilter: Filter = ({
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

export const headersFilter: Filter = ({
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
    parameters: {
      ...parameters,
      headers,
    },
    request,
    response,
  };
};
//TODO: this should be able to resolve and merge existing body in request
// export const bodyFilter: Filter = ({
//   parameters,
//   request,
//   response,
// }: {
//   parameters: RequestParameters;
//   request?: HttpRequest;
//   response?: HttpResponse;
// }) => {
//   let finalBody: FetchBody | undefined;
//   if (parameters.body) {
//     if (parameters.contentType === JSON_CONTENT) {
//       finalBody = stringBody(JSON.stringify(parameters.body));
//     } else if (parameters.contentType === URLENCODED_CONTENT) {
//       finalBody = urlSearchParamsBody(variablesToStrings(parameters.body));
//     } else if (parameters.contentType === FORMDATA_CONTENT) {
//       finalBody = formDataBody(variablesToStrings(parameters.body));
//     } else if (
//       parameters.contentType &&
//       BINARY_CONTENT_REGEXP.test(parameters.contentType)
//     ) {
//       let buffer: Buffer;
//       if (Buffer.isBuffer(parameters.body)) {
//         buffer = parameters.body;
//       } else {
//         //coerce to string then buffer
//         buffer = Buffer.from(String(parameters.body));
//       }
//       finalBody = binaryBody(buffer);
//     } else {
//       const supportedTypes = [
//         JSON_CONTENT,
//         URLENCODED_CONTENT,
//         FORMDATA_CONTENT,
//         ...BINARY_CONTENT_TYPES,
//       ];

//       throw unsupportedContentType(
//         parameters.contentType ?? '',
//         supportedTypes
//       );
//     }
//   }

//   return {
//     parameters,
//     request: {
//       ...request,
//       body: finalBody,
//     },
//   };
// };

//TODO: this is not needed when woring with parameters only
// export const queryParametersFilter: Filter = ({
//   parameters,
//   request,
//   response,
// }: {
//   parameters: RequestParameters;
//   request?: HttpRequest;
//   response?: HttpResponse;
// }) => {
//   return {
//     parameters,
//     request: {
//       ...request,
//       queryParameters: {
//         ...request.queryParameters,
//         ...variablesToStrings(parameters.queryParameters),
//       },
//     },
//     response,
//   };
// };

//TODO: this is not needed when woring with parameters only
// export const methodFilter: Filter = ({
//   parameters,
//   request,
//   response,
// }: {
//   parameters: RequestParameters;
//   request?: HttpRequest;
//   response?: HttpResponse;
// }) => {
//   return {
//     parameters,
//     request,
//     response,
//   };
// };

//TODO: this is not needed when woring with parameters only
// export const urlFilter: Filter = ({
//   parameters,
//   request,
// }: {
//   parameters: RequestParameters;
//   request: Partial<HttpRequest>;
// }) => {
//   return {
//     parameters,
//     request: {
//       ...request,
//       url: createUrl(parameters.url, {
//         baseUrl: parameters.baseUrl,
//         pathParameters: parameters.pathParameters ?? {},
//         integrationParameters: parameters.integrationParameters,
//       }),
//     },
//   };
// };

//TODO: We should try to minimalize need for this
// const mergeRequests = (
//   left: Partial<HttpRequest>,
//   right: Partial<HttpRequest>
// ): Partial<HttpRequest> => {
//   //TODO: maybe use some better way of merging
//   const result: Partial<HttpRequest> = { ...left, ...right };
//   //Headers
//   if (left.headers && right.headers) {
//     result.headers = mergeVariables(left.headers, right.headers) as Record<
//       string,
//       string | string[]
//     >;
//   }

//   //Query
//   if (left.queryParameters && right.queryParameters) {
//     result.queryParameters = mergeVariables(
//       left.queryParameters,
//       right.queryParameters
//     ) as Record<string, string>;
//   }

//   if (left.body && right.body) {
//     if (left.body._type !== right.body._type) {
//       throw new UnexpectedError(
//         'Unable to merge request bodies - body types not matching',
//         { left, right }
//       );
//     }
//     if (isStringBody(left.body) && isStringBody(right.body)) {
//       result.body = stringBody(
//         JSON.stringify({
//           ...JSON.parse(left.body.data),
//           ...JSON.parse(right.body.data),
//         })
//       );
//     }

//     if (isUrlSearchParamsBody(left.body) && isUrlSearchParamsBody(right.body)) {
//       result.body = urlSearchParamsBody({
//         ...left.body.data,
//         ...right.body.data,
//       });
//     }

//     if (isFormDataBody(left.body) && isFormDataBody(right.body)) {
//       result.body = formDataBody({ ...left.body.data, ...right.body.data });
//     }

//     if (isBinaryBody(left.body) && isBinaryBody(right.body)) {
//       throw new UnexpectedError('Not implemented yet');
//     }
//   }

//   return result;
// };

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
