import 'isomorphic-form-data';

import { HttpSecurityRequirement } from '@superfaceai/ast';
import fetch, { Headers } from 'cross-fetch';
import createDebug from 'debug';
import { inspect } from 'util';

import { getValue, NonPrimitive, Variables } from '../interpreter/variables';
import { SecurityType } from '../providerjson';
import {
  applyApiKeyAuth,
  applyHttpAuth,
  SecurityConfiguration,
} from './security';

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

const formData = (data?: Record<string, string>): FormData => {
  const formData = new FormData();

  if (data) {
    Object.entries(data).forEach(([key, value]) => formData.append(key, value));
  }

  return formData;
};

export const createUrl = (
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
      url =
        parameters.baseUrl.replace(/\/+$/, '') + inputUrl.replace(/\/+$/, '');
    }
  } else {
    url = inputUrl;
  }

  if (parameters.pathParameters) {
    const replacements: string[] = [];

    const regex = RegExp('{([^}]*)}', 'g');
    let replacement: RegExpExecArray | null;
    while ((replacement = regex.exec(url)) !== null) {
      replacements.push(replacement[1]);
    }

    const entries = replacements.map<[string, Variables | undefined]>(key => [
      key,
      getValue(parameters.pathParameters, key.split('.')),
    ]);
    const values = Object.fromEntries(entries);
    const missingKeys = replacements.filter(key => values[key] === undefined);

    if (missingKeys.length > 0) {
      throw new Error(
        `Values for URL replacement keys not found: ${missingKeys.join(', ')}`
      );
    }

    const stringifiedValues = variablesToStrings(values);

    for (const param of Object.keys(values)) {
      const replacement = stringifiedValues[param];

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
      securityRequirements?: HttpSecurityRequirement[];
      securityConfiguration?: SecurityConfiguration[];
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

    const securityConfiguration = parameters.securityConfiguration ?? [];
    const contextForSecurity = {
      headers,
      queryAuth,
      pathParameters,
      requestBody,
    };
    for (const requirement of parameters.securityRequirements ?? []) {
      const configuration = securityConfiguration.find(
        c => c.id === requirement.id
      );
      if (configuration === undefined) {
        throw new Error(
          `Credentials for security scheme "${requirement.id}" not present.`
        );
      }

      if (configuration.type === SecurityType.APIKEY) {
        applyApiKeyAuth(contextForSecurity, configuration);
      } else {
        applyHttpAuth(contextForSecurity, configuration);
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
    // secrets might appear in headers, url path, query parameters or body
    debugSensitive(
      `\t${params.method || 'UNKNOWN METHOD'} ${finalUrl} HTTP/1.1`
    );
    Object.entries(requestHeaders).forEach(([headerName, value]) =>
      debugSensitive(`\t${headerName}: ${value}`)
    );
    if (requestBody !== undefined) {
      debugSensitive(`\n${inspect(requestBody, true, 5)}`);
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
    debugSensitive(`\tHTTP/1.1 ${response.status} ${response.statusText}`);
    Object.entries(responseHeaders).forEach(([headerName, value]) =>
      debugSensitive(`\t${headerName}: ${value}`)
    );
    debugSensitive('\n\t%j', responseBody);

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
