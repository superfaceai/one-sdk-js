import { HttpSecurityRequirement } from '@superfaceai/ast';
import createDebug from 'debug';
import { inspect } from 'util';

import { USER_AGENT } from '../../..';
import { recursiveKeyList } from '../../../lib/object';
import { SecurityType } from '../..';
import { SDKExecutionError } from '../../errors';
import {
  getValue,
  NonPrimitive,
  Variables,
  variablesToStrings,
} from '../variables';
import {
  FetchInstance,
  FetchParameters,
  FORMDATA_CONTENT,
  formDataBody,
  JSON_CONTENT,
  stringBody,
  URLENCODED_CONTENT,
  urlSearchParamsBody,
} from './interfaces';
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

export enum NetworkErrors {
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
}

export const createUrl = (
  inputUrl: string,
  parameters?: {
    baseUrl?: string;
    pathParameters?: NonPrimitive;
  }
): string => {
  const isRelative = /^\/[^/]/.test(inputUrl);

  let url: string;

  if (isRelative) {
    if (parameters?.baseUrl === undefined) {
      throw new Error('Relative URL specified, but base URL not provided!');
    } else {
      url = parameters.baseUrl.replace(/\/+$/, '') + inputUrl;
    }
  } else {
    url = inputUrl;
  }

  if (parameters?.pathParameters !== undefined) {
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
      const missing = missingKeys.join(', ');
      const all = replacements.join(', ');
      const available = recursiveKeyList(parameters.pathParameters ?? {}).join(
        ', '
      );

      throw new SDKExecutionError(
        `Missing values for URL path replacement: ${missing}`,
        [
          `Trying to replace path keys for url: ${url}`,
          all.length > 0
            ? `Found these path keys: ${all}`
            : 'Found no path keys',
          available.length > 0
            ? `But only found these potential variables: ${available}`
            : 'But found no potential variables',
        ],
        [
          'Make sure the url path variable refers to an available variable',
          'Consider introducing a new variable with the correct name and desired value',
        ]
      );
    }

    const stringifiedValues = variablesToStrings(values);

    for (const param of Object.keys(values)) {
      const replacement = stringifiedValues[param];

      url = url.replace(`{${param}}`, replacement);
    }
  }

  return `${url}`;
};

export class HttpClient {
  constructor(private fetchInstance: FetchInstance) {}

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
      baseUrl?: string;
      pathParameters?: NonPrimitive;
    }
  ): Promise<HttpResponse> {
    const headers = variablesToStrings(parameters?.headers);
    headers['accept'] = parameters.accept || '*/*';

    const request: FetchParameters = {
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
        throw new SDKExecutionError(
          `Security values for security scheme not found: ${requirement.id}`,
          [
            `Security values for scheme "${requirement.id}" are required by the map`,
            `but they were not provided to the sdk`,
          ],
          [
            `Make sure that the security scheme "${requirement.id}" exists in provider definition`,
            `Check that either super.json or provider configuration provides security values for the "${requirement.id}" security scheme`,
          ]
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
        headers['Content-Type'] ??= JSON_CONTENT;
        request.body = stringBody(JSON.stringify(requestBody));
      } else if (parameters.contentType === URLENCODED_CONTENT) {
        headers['Content-Type'] ??= URLENCODED_CONTENT;
        request.body = urlSearchParamsBody(variablesToStrings(requestBody));
      } else if (parameters.contentType === FORMDATA_CONTENT) {
        headers['Content-Type'] ??= FORMDATA_CONTENT;
        request.body = formDataBody(variablesToStrings(requestBody));
      } else {
        const contentType = parameters.contentType ?? '';
        const supportedTypes = [
          JSON_CONTENT,
          URLENCODED_CONTENT,
          FORMDATA_CONTENT,
        ].join(', ');
        throw new SDKExecutionError(
          `Content type not supported: ${contentType}`,
          [
            `Requested content type "${contentType}"`,
            `Supported content types: ${supportedTypes}`,
          ],
          []
        );
      }
    }
    headers['user-agent'] ??= USER_AGENT;

    const finalUrl = createUrl(url, {
      baseUrl: parameters.baseUrl,
      pathParameters,
    });

    request.queryParameters = {
      ...variablesToStrings(parameters.queryParameters),
      ...queryAuth,
    };

    debug('Executing HTTP Call');
    // secrets might appear in headers, url path, query parameters or body
    debugSensitive(
      `\t${request.method || 'UNKNOWN METHOD'} ${finalUrl} HTTP/1.1`
    );
    Object.entries(headers).forEach(([headerName, value]) =>
      debugSensitive(`\t${headerName}: ${value}`)
    );
    if (requestBody !== undefined) {
      debugSensitive(`\n${inspect(requestBody, true, 5)}`);
    }
    const response = await this.fetchInstance.fetch(finalUrl, request);

    debug('Received response');
    debugSensitive(`\tHTTP/1.1 ${response.status} ${response.statusText}`);
    Object.entries(response.headers).forEach(([headerName, value]) =>
      debugSensitive(`\t${headerName}: ${value}`)
    );
    debugSensitive('\n\t%j', response.body);

    return {
      statusCode: response.status,
      body: response.body,
      headers: response.headers,
      debug: {
        request: {
          url: finalUrl,
          headers,
          body: requestBody,
        },
      },
    };
  }
}
