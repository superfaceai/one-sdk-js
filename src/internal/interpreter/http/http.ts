import {
  HttpScheme,
  HttpSecurityRequirement,
  SecurityType,
} from '@superfaceai/ast';
import createDebug from 'debug';
import { inspect } from 'util';

import { AuthCache } from '../../../client';
import { USER_AGENT } from '../../../index';
import { recursiveKeyList } from '../../../lib/object';
import { UnexpectedError } from '../../errors';
import {
  missingPathReplacementError,
  missingSecurityValuesError,
  unsupportedContentType,
} from '../../errors.helpers';
import {
  getValue,
  NonPrimitive,
  Variables,
  variablesToStrings,
} from '../variables';
import { DigestHelper } from './digest';
import {
  BINARY_CONTENT_REGEXP,
  BINARY_CONTENT_TYPES,
  binaryBody,
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
  constructor(private fetchInstance: FetchInstance & AuthCache) { }

  private async makeRequest(url: string, headers: Record<string, string>, requestBody: Variables | undefined, request: FetchParameters): Promise<HttpResponse> {
    debug('Executing HTTP Call');
    // secrets might appear in headers, url path, query parameters or body
    debugSensitive(
      `\t${request.method || 'UNKNOWN METHOD'} ${url} HTTP/1.1`
    );
    Object.entries(headers).forEach(([headerName, value]) =>
      debugSensitive(`\t${headerName}: ${value}`)
    );
    if (requestBody !== undefined) {
      debugSensitive(`\n${inspect(requestBody, true, 5)}`);
    }
    const response = await this.fetchInstance.fetch(url, request);

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
          url: url,
          headers,
          body: requestBody,
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
    // let authCacheHit = false;
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
      } else if (
        parameters.contentType &&
        BINARY_CONTENT_REGEXP.test(parameters.contentType)
      ) {
        headers['Content-Type'] ??= parameters.contentType;
        let buffer: Buffer;
        if (Buffer.isBuffer(requestBody)) {
          buffer = requestBody;
        } else {
          //coerce to string then buffer
          buffer = Buffer.from(String(requestBody));
        }
        request.body = binaryBody(buffer);
      } else {
        const contentType = parameters.contentType ?? '';
        const supportedTypes = [
          JSON_CONTENT,
          URLENCODED_CONTENT,
          FORMDATA_CONTENT,
          ...BINARY_CONTENT_TYPES,
        ];

        throw unsupportedContentType(contentType, supportedTypes);
      }
    }
    headers['user-agent'] ??= USER_AGENT;

    const finalUrl = createUrl(url, {
      baseUrl: parameters.baseUrl,
      pathParameters,
      integrationParameters: parameters.integrationParameters,
    });

    request.queryParameters = {
      ...variablesToStrings(parameters.queryParameters),
      ...queryAuth,
    };

    for (const requirement of parameters.securityRequirements ?? []) {
      const configuration = securityConfiguration.find(
        configuration => configuration.id === requirement.id
      );
      if (configuration === undefined) {
        throw missingSecurityValuesError(requirement.id);
      }

      if (configuration.type === SecurityType.APIKEY) {
        applyApiKeyAuth(contextForSecurity, configuration);
        //TODO: move this to separate file
      } else if (configuration.scheme === HttpScheme.DIGEST) {
        //FIX: Should be passed in super.json configuration
        const user = process.env.CLOCKPLUS_USERNAME;
        if (!user) {
          throw new UnexpectedError('Missing user');
        }
        const password = process.env.CLOCKPLUS_PASSWORD;
        if (!password) {
          throw new UnexpectedError('Missing password');
        }


        //FIX: Provider.json configuration should also contain optional: statusCode, header containing challange, header used for athorization
        const digest = new DigestHelper(user, password, this.fetchInstance);

        const AUTH_HEADER_NAME = 'Authorization';

        let res: HttpResponse

        //Try to reuse old header
        //Make call with old header or without it (to get challange header)
        if (this.fetchInstance.cache) {
          headers[AUTH_HEADER_NAME] = digest.buildDigestAuth(finalUrl, request.method, this.fetchInstance.cache)
          // console.log(`REUSE__________________________________________`)
          res = await this.makeRequest(finalUrl, headers, requestBody, request)
        } else {
          // const tempRequest = { ...request, headers: {} }
          res = await this.makeRequest(finalUrl, headers, requestBody, request)
        }

        //Properties from helper instance
        const statusCode = 401;
        const header = 'www-authenticate'

        if (res.statusCode === statusCode) {
          if (res.headers[header]) {
            const digestValues = digest.extractDigestValues(res.headers[header])
            headers[AUTH_HEADER_NAME] = digest.buildDigestAuth(finalUrl, request.method, digestValues)
            res = await this.makeRequest(finalUrl, headers, requestBody, request)
          }
        }

        return res

        //"Proxy-Authorization" can be also used when communicating thru proxy https://datatracker.ietf.org/doc/html/rfc2617#section-1.2
        // headers[AUTH_HEADER_NAME] = await digest.prepareAuth(
        //   finalUrl, request.method);
        // //TODO: we need Superface client to remember auth state to be able to reuse authentication: https://datatracker.ietf.org/doc/html/rfc2617#section-3.3
        // await applyDigest(
        //   contextForSecurity,
        //   configuration,
        //   parameters.method,
        //   finalUrl,
        //   this.fetchInstance
        // );
      } else {
        applyHttpAuth(contextForSecurity, configuration);
      }
    }

    return this.makeRequest(finalUrl, headers, requestBody, request)

    //TODO: we should be able to retry request when we "resused" authCache (we are using old auth header value) and response has statusCode matching status code in provider.json.
    //It means auth failed and server sends new challenge
    //Something like:
    // if (authCacheHit && isDigestAuth && response.status === statusCodeFromProviderJson) {
    //   const extracted = DigestHelper.extractDigestValues(response.headers[headerFromProviderJson])
    //   const auth = DigestHelper.buildDigestAuth(url, method, extracted)
    //   context.headers[authheaderFromProviderJson || AUTH_HEADER_NAME]

    //   retry request
    // }
    // It looks like requests itself should be wraped be some security helper which will prepare auth and can react on response - and retry it.

  }
}
