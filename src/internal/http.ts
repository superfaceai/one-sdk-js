import 'isomorphic-form-data';

import { HttpSecurity } from '@superfaceai/language';
import fetch, { Headers } from 'cross-fetch';

import { Config } from '../client';
import { evalScript } from '../client/interpreter/Sandbox';
import { Variables } from './interpreter/variables';

export interface HttpResponse {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
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
    const undefinedKeys: string[] = Object.keys(parameters).filter(
      key => parameters[key] === undefined
    );
    if (undefinedKeys.length > 0) {
      throw new Error(
        `Invalid or missing parameters: ${undefinedKeys.join(', ')}`
      );
    }

    return '?' + new URLSearchParams(parameters).toString();
  }

  return '';
};

const basicAuth = (auth?: { username: string; password: string }): string => {
  if (!auth || !auth.username || !auth.password) {
    throw new Error('Missing credentials for Basic auth!');
  }

  return (
    'Basic ' +
    Buffer.from(`${auth.username}:${auth.password}`).toString('base64')
  );
};

const bearerAuth = (auth?: { token: string }): string => {
  if (!auth || !auth.token) {
    throw new Error('Missing credentials for Bearer auth!');
  }

  return `Bearer ${auth.token}`;
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
    pathParameters?: Variables;
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
      auth?: Config['auth'];
      baseUrl?: string;
      pathParameters?: Variables;
    }
  ): Promise<HttpResponse> => {
    const headers = new Headers(variablesToStrings(parameters?.headers));
    headers.append('Accept', parameters.accept ?? '*/*');

    const params: RequestInit = {
      headers,
      method: parameters.method,
    };

    if (
      parameters.body &&
      ['post', 'put', 'patch'].includes(parameters.method.toLowerCase())
    ) {
      if (parameters.contentType === JSON_CONTENT) {
        headers.append('Content-Type', JSON_CONTENT);
        params.body = JSON.stringify(parameters.body);
      } else if (parameters.contentType === URLENCODED_CONTENT) {
        headers.append('Content-Type', URLENCODED_CONTENT);
        params.body = new URLSearchParams(variablesToStrings(parameters.body));
      } else if (parameters.contentType === FORMDATA_CONTENT) {
        headers.append('Content-Type', FORMDATA_CONTENT);
        params.body = formData(variablesToStrings(parameters.body));
      } else {
        throw new Error(
          `Unknown content type: ${parameters.contentType ?? ''}`
        );
      }
    }

    let queryAuth: Record<string, string> = {};
    if (parameters.security?.scheme === 'basic') {
      headers.append(AUTH_HEADER_NAME, basicAuth(parameters.auth?.basic));
    } else if (parameters.security?.scheme === 'bearer') {
      headers.append(AUTH_HEADER_NAME, bearerAuth(parameters.auth?.bearer));
    } else if (parameters.security?.scheme === 'apikey') {
      if (!parameters.auth?.apikey?.key) {
        throw new Error('Missing credentials for Apikey auth!');
      }
      if (parameters.security.placement === 'header') {
        headers.append(parameters.security.name, parameters.auth.apikey.key);
      } else if (parameters.security.placement === 'query') {
        queryAuth = { [parameters.security.name]: parameters.auth.apikey.key };
      }
    }

    const finalUrl = createUrl(url, {
      baseUrl: parameters.baseUrl,
      pathParameters: parameters.pathParameters,
      queryParameters: {
        ...variablesToStrings(parameters.queryParameters),
        ...queryAuth,
      },
    });

    const response = await fetch(finalUrl, params);

    let body: unknown;

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((key, value) => {
      responseHeaders[value] = key;
    });

    if (
      (responseHeaders['content-type'] &&
        responseHeaders['content-type'].includes(JSON_CONTENT)) ||
      parameters.accept?.includes(JSON_CONTENT)
    ) {
      body = await response.json();
    } else {
      body = await response.text();
    }

    return {
      statusCode: response.status,
      body,
      headers: responseHeaders,
    };
  },
};
