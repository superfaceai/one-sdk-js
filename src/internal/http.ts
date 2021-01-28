import 'isomorphic-form-data';

import { HttpSecurity } from '@superfaceai/ast';
import fetch, { Headers } from 'cross-fetch';
import createDebug from 'debug';

import { evalScript } from './interpreter/sandbox';
import { NonPrimitive, Variables } from './interpreter/variables';
import { Auth } from './superjson';

const debug = createDebug('superface:http');

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

const AUTH_HEADER_NAME = 'Authorization';
const JSON_CONTENT = 'application/json';
const URLENCODED_CONTENT = 'application/x-www-form-urlencoded';
const FORMDATA_CONTENT = 'multipart/form-data';

const variablesToStrings = (variables?: Variables): Record<string, string> => {
  const result: Record<string, string> = {};

  if (variables) {
    for (const [key, value] of Object.entries(variables)) {
      result[key] = typeof value === 'string' ? value : JSON.stringify(value);
    }
  }

  return result;
};

const queryParameters = (parameters?: Record<string, string>): string => {
  if (parameters && Object.keys(parameters).length) {
    const definedParameters = Object.entries(parameters).reduce(
      (result, [key, value]) => {
        if (value === undefined) {
          return result;
        }

        return {
          ...result,
          [key]: value,
        };
      },
      {}
    );

    return '?' + new URLSearchParams(definedParameters).toString();
  }

  return '';
};

const basicAuth = (auth: Auth): string => {
  if (!('BasicAuth' in auth)) {
    throw new Error('Missing credentials for Basic auth!');
  }

  return (
    'Basic ' +
    Buffer.from(
      `${auth.BasicAuth.username}:${auth.BasicAuth.password}`
    ).toString('base64')
  );
};

const apiKeyAuth = (auth: Auth): string => {
  if (!('ApiKey' in auth)) {
    throw new Error('Missing credentials for Bearer auth!');
  }

  return `${auth.ApiKey.type === 'bearer' ? 'Bearer ' : ''}${
    auth.ApiKey.value
  }`;
};

const formData = (data?: Record<string, string>): FormData => {
  const formData = new FormData();

  if (data) {
    Object.entries(data).forEach(([key, value]) => formData.append(key, value));
  }

  return formData;
};

const createUrl = (
  inputUrl: string,
  parameters: {
    baseUrl?: string;
    pathParameters?: NonPrimitive;
    queryParameters?: Record<string, string>;
  }
): string => {
  const query = queryParameters(parameters.queryParameters);
  const isRelative = /^\/[^/]/.test(inputUrl);

  let url: string;

  if (isRelative) {
    if (!parameters.baseUrl) {
      throw new Error('Relative URL specified, but base URL not provided!');
    } else {
      url = `${parameters.baseUrl}${inputUrl}`;
    }
  } else {
    url = inputUrl;
  }

  if (parameters.pathParameters) {
    const pathParameters = Object.keys(parameters.pathParameters);
    const replacements: string[] = [];

    const regex = RegExp('{(.*?)}', 'g');
    let replacement: RegExpExecArray | null;
    while ((replacement = regex.exec(url)) !== null) {
      replacements.push(replacement[1]);
    }

    const missingKeys = replacements.filter(
      key => !pathParameters.includes(key)
    );

    if (missingKeys.length) {
      throw new Error(
        `Values for URL replacement keys not found: ${missingKeys.join(', ')}`
      );
    }

    for (const param of pathParameters) {
      // TODO: Check type?
      const replacement = evalScript(
        param,
        parameters.pathParameters
      ) as string;
      url = url.replace(`{${param}}`, replacement);
    }
  }

  return `${url}${query}`;
};

export const HttpClient = {
  request: async (
    url: string,
    parameters: {
      method: string;
      headers?: Variables;
      queryParameters?: Variables;
      body?: Variables;
      contentType?: string;
      accept?: string;
      security?: HttpSecurity;
      auth?: Auth;
      baseUrl?: string;
      pathParameters?: NonPrimitive;
    }
  ): Promise<HttpResponse> => {
    const headers = new Headers(variablesToStrings(parameters?.headers));
    headers.append('Accept', parameters.accept ?? '*/*');

    const params: RequestInit = {
      headers,
      method: parameters.method,
    };

    const queryAuth: Record<string, string> = {};
    const requestBody = parameters.body;
    const pathParameters = { ...parameters.pathParameters };
    if (parameters.auth !== undefined) {
      if ('BasicAuth' in parameters.auth) {
        headers.append(AUTH_HEADER_NAME, basicAuth(parameters.auth));
      } else if ('ApiKey' in parameters.auth) {
        switch (parameters.auth.ApiKey.in) {
          case 'header':
            headers.append(
              parameters.auth.ApiKey.header ?? AUTH_HEADER_NAME,
              apiKeyAuth(parameters.auth)
            );
            break;
          case 'query':
            queryAuth[parameters.auth.ApiKey.parameter] = apiKeyAuth(
              parameters.auth
            );
            break;
          case 'body':
            if (typeof requestBody !== 'object' || Array.isArray(requestBody)) {
              throw new Error(
                'ApiKey in body can be used only when body is an object.'
              );
            }
            requestBody[parameters.auth.ApiKey.field] = apiKeyAuth(
              parameters.auth
            );
            break;
          case 'path':
            pathParameters[parameters.auth.ApiKey.name] = apiKeyAuth(
              parameters.auth
            );
            break;
        }
      }
    }

    if (
      parameters.body &&
      ['post', 'put', 'patch'].includes(parameters.method.toLowerCase())
    ) {
      if (parameters.contentType === JSON_CONTENT) {
        headers.append('Content-Type', JSON_CONTENT);
        params.body = JSON.stringify(requestBody);
      } else if (parameters.contentType === URLENCODED_CONTENT) {
        headers.append('Content-Type', URLENCODED_CONTENT);
        params.body = new URLSearchParams(variablesToStrings(requestBody));
      } else if (parameters.contentType === FORMDATA_CONTENT) {
        headers.append('Content-Type', FORMDATA_CONTENT);
        params.body = formData(variablesToStrings(requestBody));
      } else {
        throw new Error(
          `Unknown content type: ${parameters.contentType ?? ''}`
        );
      }
    }

    const finalUrl = createUrl(url, {
      baseUrl: parameters.baseUrl,
      pathParameters,
      queryParameters: {
        ...variablesToStrings(parameters.queryParameters),
        ...queryAuth,
      },
    });

    const requestHeaders: Record<string, string> = {};
    if (headers) {
      headers.forEach((value, headerName) => {
        requestHeaders[headerName] = value;
      });
    }
    debug('Executing HTTP Call');
    debug(`\t${params.method || 'UNKNOWN METHOD'} ${finalUrl} HTTP/1.1`);
    Object.entries(requestHeaders).forEach(([headerName, value]) =>
      debug(`\t${headerName}: ${value}`)
    );
    if (requestBody !== undefined) {
      debug(`\n\t${requestBody?.toString()}`);
    }
    const response = await fetch(finalUrl, params);

    let responseBody: unknown;

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, headerName) => {
      responseHeaders[headerName] = value;
    });

    if (
      (responseHeaders['content-type'] &&
        responseHeaders['content-type'].includes(JSON_CONTENT)) ||
      parameters.accept?.includes(JSON_CONTENT)
    ) {
      responseBody = await response.json();
    } else {
      responseBody = await response.text();
    }

    debug('Received response');
    debug(`\tHTTP/1.1 ${response.status} ${response.statusText}`);
    Object.entries(responseHeaders).forEach(([headerName, value]) =>
      debug(`\t${headerName}: ${value}`)
    );
    debug('\n\t%j', responseBody);

    return {
      statusCode: response.status,
      body: responseBody,
      headers: responseHeaders,
      debug: {
        request: {
          url: finalUrl,
          headers: requestHeaders,
          body: requestBody,
        },
      },
    };
  },
};
