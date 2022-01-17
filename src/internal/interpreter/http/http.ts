import { HttpSecurityRequirement } from '@superfaceai/ast';
import createDebug from 'debug';
import { inspect } from 'util';

import { AuthCache } from '../../../client';
import { USER_AGENT } from '../../../index';
import { recursiveKeyList } from '../../../lib/object';
import { UnexpectedError } from '../../errors';
import { missingPathReplacementError } from '../../errors.helpers';
import {
  getValue,
  NonPrimitive,
  Variables,
  variablesToStrings,
} from '../variables';
import { FetchInstance } from './interfaces';
import {
  HttpRequest,
  ISecurityHandler,
  RequestParameters,
  SecurityConfiguration,
} from './security';
import {
  AuthorizationCodeHandler,
  TempAuthorizationCodeConfiguration,
} from './security/oauth/authorization-code/authorization-code';
import { prepareRequest } from './security/utils';

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

function replaceParameters(url: string, parameters: NonPrimitive) {
  const replacements: string[] = [];

  const regex = RegExp('{([^}]*)}', 'g');
  let replacement: RegExpExecArray | null;
  while ((replacement = regex.exec(url)) !== null) {
    replacements.push(replacement[1]);
  }

  const entries = replacements.map<[string, Variables | undefined]>(key => [
    key,
    getValue(parameters, key.split('.')),
  ]);
  const values = Object.fromEntries(entries);
  const missingKeys = replacements.filter(key => values[key] === undefined);

  if (missingKeys.length > 0) {
    const missing = missingKeys;
    const all = replacements;
    const available = recursiveKeyList(parameters ?? {});

    throw missingPathReplacementError(missing, url, all, available);
  }

  const stringifiedValues = variablesToStrings(values);

  for (const param of Object.keys(values)) {
    const replacement = stringifiedValues[param];

    url = url.replace(`{${param}}`, replacement);
  }

  return url;
}

export const createUrl = (
  inputUrl: string,
  parameters: {
    baseUrl: string;
    pathParameters?: NonPrimitive;
    integrationParameters?: Record<string, string>;
  }
): string => {
  const baseUrl = replaceParameters(
    parameters.baseUrl,
    parameters.integrationParameters ?? {}
  );

  if (inputUrl === '') {
    return baseUrl;
  }
  const isRelative = /^\/[^/]/.test(inputUrl);
  if (!isRelative) {
    throw new UnexpectedError('Expected relative url, but received absolute!');
  }

  const url = replaceParameters(inputUrl, parameters.pathParameters ?? {});

  return baseUrl.replace(/\/+$/, '') + url;
};

export class HttpClient {
  constructor(private fetchInstance: FetchInstance & AuthCache) {}

  private async makeRequest(request: HttpRequest): Promise<HttpResponse> {
    debug('Executing HTTP Call');
    // secrets might appear in headers, url path, query parameters or body
    if (debugSensitive.enabled) {
      const hasSearchParams =
        Object.keys(request.queryParameters || {}).length > 0;
      const searchParams = new URLSearchParams(request.queryParameters);
      debugSensitive(
        '\t%s %s%s HTTP/1.1',
        request.method || 'UNKNOWN METHOD',
        request.url,
        hasSearchParams ? '?' + searchParams.toString() : ''
      );
      Object.entries(request.headers || {}).forEach(([headerName, value]) =>
        debugSensitive(`\t${headerName}: ${value}`)
      );
      if (request.body !== undefined) {
        debugSensitive(`\n${inspect(request.body, true, 5)}`);
      }
    }
    const response = await this.fetchInstance.fetch(request.url, request);

    debug('Received response');
    if (debugSensitive.enabled) {
      debugSensitive(`\tHTTP/1.1 ${response.status} ${response.statusText}`);
      Object.entries(response.headers).forEach(([headerName, value]) =>
        debugSensitive(`\t${headerName}: ${value}`)
      );
      debugSensitive('\n\t%j', response.body);
    }

    return {
      statusCode: response.status,
      body: response.body,
      headers: response.headers,
      debug: {
        request: {
          url: request.url,
          //FIX:
          headers: {}, // request.headers || {},
          body: request.body,
        },
      },
    };
  }

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
      baseUrl: string;
      pathParameters?: NonPrimitive;
      integrationParameters?: Record<string, string>;
    }
  ): Promise<HttpResponse> {
    const securityHandlers: ISecurityHandler[] = [];
    let retry = true;
    let numberOfRequests = 0;
    const headers = variablesToStrings(parameters?.headers);
    headers['accept'] = parameters.accept || '*/*';
    headers['user-agent'] ??= USER_AGENT;

    // const securityConfiguration = parameters.securityConfiguration ?? [];

    const resourceRequestParameters: RequestParameters = {
      url,
      baseUrl: parameters.baseUrl,
      integrationParameters: parameters.integrationParameters,
      pathParameters: parameters.pathParameters,
      body: parameters.body,
      contentType: parameters.contentType,
      method: parameters.method,
      headers,
    };
    //Prepare request without any auth
    let request = prepareRequest(resourceRequestParameters);
    //Add auth
    //TODO: this approach is problematic - it will be hard to do multiple auth. methods at once (eg. digest and oauth).
    //For now we ignore the problem
    // for (const requirement of parameters.securityRequirements ?? []) {
    //   const configuration = securityConfiguration.find(
    //     configuration => configuration.id === requirement.id
    //   );
    //   if (configuration === undefined) {
    //     throw missingSecurityValuesError(requirement.id);
    //   }

    //   if (configuration.type === SecurityType.APIKEY) {
    //     const handler = new ApiKeyHandler(configuration);
    //     request = handler.prepare(resourceRequestParameters);
    //     securityHandlers.push(handler);
    //   } else if (configuration.scheme === HttpScheme.DIGEST) {
    //     const handler = new DigestHandler(configuration);
    //     request = handler.prepare(
    //       resourceRequestParameters,
    //       this.fetchInstance
    //     );
    //     securityHandlers.push(handler);
    //   } else {
    //     const handler = new HttpHandler(configuration);
    //     request = handler.prepare(resourceRequestParameters);
    //     securityHandlers.push(handler);
    //   }
    // }

    //Test the oauth
    const config: TempAuthorizationCodeConfiguration = {
      clientId: process.env['GOOGLE_CLIENT_ID'] || '',
      clientSecret: process.env['GOOGLE_CLIENT_SECRET'] || '',
      tokenUrl: '/oauth2/v4/token',
      refreshToken: process.env['GOOGLE_CLIENT_REFRESH_TOKEN'] || '',
      scopes: [],
    };
    const handler = new AuthorizationCodeHandler(config);
    request = handler.prepare(resourceRequestParameters, this.fetchInstance);
    console.log('first req', request);
    securityHandlers.push(handler as unknown as ISecurityHandler);
    let response: HttpResponse;

    do {
      response = await this.makeRequest(request);
      //TODO: or call handle on all the handers (with defined handle)?
      const handler = securityHandlers.find(h => h.handle !== undefined);
      //If we have handle we use it to get new values for api call and new retry value
      if (handler && handler.handle) {
        const retryRequest = handler.handle(
          response,
          resourceRequestParameters,
          this.fetchInstance
        );
        if (retryRequest) {
          request = retryRequest;
          retry = true;
        } else {
          retry = false;
        }
      } else {
        retry = false;
      }
      //numeric limit to avoid inf. loop
      //TODO: this could be env. variable
      if (numberOfRequests > 5) {
        throw new UnexpectedError(
          'Exceded number of calls - risk of falling into infinite loop'
        );
      }
      numberOfRequests++;
    } while (retry);

    return response;
  }
}
