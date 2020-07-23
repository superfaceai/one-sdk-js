import 'isomorphic-form-data';

import fetch, { Headers } from 'cross-fetch';

import { evalScript } from '../client/interpreter/Sandbox';
import { Variables } from './interpreter/interfaces';

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
    return '?' + new URLSearchParams(parameters).toString();
  }

  return '';
};

const basicAuth = (auth?: { username: string; password: string }): string => {
  if (!auth || !auth.username || !auth.password) {
    throw new Error('Missing credentials for Basic Auth!');
  }

  return (
    'Basic ' +
    Buffer.from(`${auth.username}:${auth.password}`).toString('base64')
  );
};

const bearerAuth = (auth?: { token: string }): string => {
  if (!auth || !auth.token) {
    throw new Error('Missing token for Bearer Auth!');
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

const createUrl = async (
  inputUrl: string,
  parameters: {
    baseUrl?: string;
    pathParameters?: Variables;
    queryParameters?: Record<string, string>;
  }
): Promise<string> => {
  const query = queryParameters(parameters.queryParameters);
  const isRelative = /^\/[^/]/.test(inputUrl);

  if (isRelative && !parameters.baseUrl) {
    throw new Error('Relative URL specified, but base URL not provided!');
  }

  let url = isRelative ? `${parameters.baseUrl}${inputUrl}` : inputUrl;

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
      url = url.replace(
        `{${param}}`,
        (await evalScript(param, parameters.pathParameters)) as string
      );
    }
  }

  return `${url}${query}`;
};

export const HttpClient = {
  request: async (
    url: string,
    parameters: {
      method: string;
      headers?: Record<string, string>;
      queryParameters?: Record<string, string>;
      body?: Variables;
      contentType?: string;
      accept?: string;
      security?: 'basic' | 'bearer' | 'other';
      basic?: { username: string; password: string };
      bearer?: { token: string };
      baseUrl?: string;
      pathParameters?: Variables;
    }
  ): Promise<HttpResponse> => {
    const headers = new Headers(parameters?.headers);
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
        throw new Error(`Unknown content type: ${parameters.contentType}`);
      }
    }

    if (parameters.security === 'basic') {
      headers.append(AUTH_HEADER_NAME, basicAuth(parameters.basic));
    } else if (parameters.security === 'bearer') {
      headers.append(AUTH_HEADER_NAME, bearerAuth(parameters.bearer));
    }

    const response = await fetch(
      encodeURI(
        await createUrl(url, {
          baseUrl: parameters.baseUrl,
          pathParameters: parameters.pathParameters,
          queryParameters: parameters.queryParameters,
        })
      ),
      params
    );

    let body: unknown;

    if (parameters.accept === JSON_CONTENT) {
      body = await response.json();
    } else {
      body = await response.text();
    }

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((key, value) => {
      responseHeaders[key] = value;
    });

    return {
      statusCode: response.status,
      body,
      headers: responseHeaders,
    };
  },
};
