import {
  HttpScheme,
  HttpSecurityRequirement,
  SecurityType,
} from '@superfaceai/ast';
import createDebug from 'debug';
import { inspect } from 'util';

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
import {
  BINARY_CONTENT_REGEXP,
  BINARY_CONTENT_TYPES,
  binaryBody,
  FetchBody,
  FetchInstance,
  FORMDATA_CONTENT,
  formDataBody,
  JSON_CONTENT,
  stringBody,
  URLENCODED_CONTENT,
  urlSearchParamsBody,
} from './interfaces';
import {
  ApiKeyHandler,
  AuthCache,
  DigestHandler,
  HttpHandler,
  HttpRequest,
  ISecurityHandler,
  RequestParameters,
  SecurityConfiguration,
} from './security';
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
//TODO: not sure if this can be exported or shoul be passed as argument
export async function fetchRequest(
  fetchInstance: FetchInstance,
  request: HttpRequest
): Promise<HttpResponse> {
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
      debugSensitive(
        `\t${headerName}: ${Array.isArray(value) ? value.join(', ') : value}`
      )
    );
    if (request.body !== undefined) {
      debugSensitive(`\n${inspect(request.body, true, 5)}`);
    }
  }
  const response = await fetchInstance.fetch(request.url, request);

  debug('Received response');
  if (debugSensitive.enabled) {
    debugSensitive(`\tHTTP/1.1 ${response.status} ${response.statusText}`);
    Object.entries(response.headers).forEach(([headerName, value]) =>
      debugSensitive(`\t${headerName}: ${value}`)
    );
    debugSensitive('\n\t%j', response.body);
  }

  const headers: Record<string, string> = {};
  Object.entries(request.headers ?? {}).forEach(([key, value]) => {
    headers[key] = Array.isArray(value) ? value.join(' ') : value;
  });

  return {
    statusCode: response.status,
    body: response.body,
    headers: response.headers,
    debug: {
      request: {
        url: request.url,
        headers,
        body: request.body,
      },
    },
  };
}

export class HttpClient {
  constructor(private fetchInstance: FetchInstance & AuthCache) {}
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
    //Here we wil start the chain of functions to prepare actual request, each function take RequestParameters as a input, it can also take cache and fetch function. It returns RequestParameters or promise of them

    const builder = new RequestBuilder({
      parameters: {
        url,
        ...parameters,
        headers: variablesToStrings(parameters?.headers),
      },
      fetchInstance: this.fetchInstance,
      handler: getSecurityHandler(
        parameters.securityConfiguration ?? [],
        parameters.securityRequirements
      ),
      fetchRequest: fetchRequest,
    });

    return (await builder.authenticate())
      .headers()
      .queryParameters()
      .method()
      .body()
      .url()
      .execute();
  }
}

//TODO: try to get rid of class
export class RequestBuilder {
  //TODO: parameters should be read only - we will mutate HttpRequest
  private parameters: RequestParameters;
  private readonly handler: ISecurityHandler | undefined;
  private readonly fetchRequest: (
    fetchInstance: FetchInstance,
    request: HttpRequest
  ) => Promise<HttpResponse>;

  private fetchInstance: FetchInstance & AuthCache;
  private request: Partial<HttpRequest> = {};

  constructor({
    parameters,
    handler,
    fetchInstance,
    fetchRequest,
  }: {
    parameters: RequestParameters;
    fetchInstance: FetchInstance & AuthCache;
    handler: ISecurityHandler | undefined;
    fetchRequest: (
      fetchInstance: FetchInstance,
      request: HttpRequest
    ) => Promise<HttpResponse>;
  }) {
    this.parameters = parameters;
    this.fetchRequest = fetchRequest;
    this.handler = handler;
    this.fetchInstance = fetchInstance;
  }

  public async authenticate(): Promise<this> {
    if (this.handler) {
      this.parameters = await this.handler.authenticate(
        this.parameters,
        this.fetchInstance
      );
    }

    return this;
  }

  public headers(): this {
    const headers: Record<string, string> = this.parameters.headers || {};
    headers['accept'] = this.parameters.accept || '*/*';
    headers['user-agent'] ??= USER_AGENT;
    if (this.parameters.contentType === JSON_CONTENT) {
      headers['Content-Type'] ??= JSON_CONTENT;
    } else if (this.parameters.contentType === URLENCODED_CONTENT) {
      headers['Content-Type'] ??= URLENCODED_CONTENT;
    } else if (this.parameters.contentType === FORMDATA_CONTENT) {
      headers['Content-Type'] ??= FORMDATA_CONTENT;
    } else if (
      this.parameters.contentType &&
      BINARY_CONTENT_REGEXP.test(this.parameters.contentType)
    ) {
      headers['Content-Type'] ??= this.parameters.contentType;
    } else {
      const supportedTypes = [
        JSON_CONTENT,
        URLENCODED_CONTENT,
        FORMDATA_CONTENT,
        ...BINARY_CONTENT_TYPES,
      ];

      throw unsupportedContentType(
        this.parameters.contentType ?? '',
        supportedTypes
      );
    }

    this.request.headers = headers;

    return this;
  }

  public body(): this {
    if (this.parameters.body) {
      let finalBody: FetchBody | undefined;
      if (this.parameters.contentType === JSON_CONTENT) {
        finalBody = stringBody(JSON.stringify(this.parameters.body));
      } else if (this.parameters.contentType === URLENCODED_CONTENT) {
        finalBody = urlSearchParamsBody(
          variablesToStrings(this.parameters.body)
        );
      } else if (this.parameters.contentType === FORMDATA_CONTENT) {
        finalBody = formDataBody(variablesToStrings(this.parameters.body));
      } else if (
        this.parameters.contentType &&
        BINARY_CONTENT_REGEXP.test(this.parameters.contentType)
      ) {
        let buffer: Buffer;
        if (Buffer.isBuffer(this.parameters.body)) {
          buffer = this.parameters.body;
        } else {
          //coerce to string then buffer
          buffer = Buffer.from(String(this.parameters.body));
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
          this.parameters.contentType ?? '',
          supportedTypes
        );
      }
      this.request.body = finalBody;
    }

    return this;
  }

  public queryParameters(): this {
    this.request.queryParameters = variablesToStrings(
      this.parameters.queryParameters
    );

    return this;
  }

  public method(): this {
    this.request.method = this.parameters.method;

    return this;
  }

  public url(): this {
    this.request.url = createUrl(this.parameters.url, {
      baseUrl: this.parameters.baseUrl,
      pathParameters: this.parameters.pathParameters ?? {},
      integrationParameters: this.parameters.integrationParameters,
    });

    return this;
  }

  public async execute(): Promise<HttpResponse> {
    if (!this.parameters) {
      throw new Error('Parameters not set');
    }

    //Do fetch here
    let response = await this.fetchRequest(
      this.fetchInstance,
      this.request as HttpRequest
    );

    //TODO: this could be another step fn
    if (this.handler && this.handler.handleResponse) {
      const newParameters = await this.handler.handleResponse(
        response,
        this.parameters,
        this.fetchInstance
        // this.fetchRequest
      );
      if (newParameters) {
        this.parameters = newParameters;
        response = await this.fetchRequest(
          this.fetchInstance,
          prepareRequest(this.parameters)
        );
      }
    }

    return response;
  }
}

function getSecurityHandler(
  securityConfiguration: SecurityConfiguration[],
  securityRequirements?: HttpSecurityRequirement[]
): ISecurityHandler | undefined {
  let handler: ISecurityHandler | undefined = undefined;
  for (const requirement of securityRequirements ?? []) {
    const configuration = securityConfiguration.find(
      configuration => configuration.id === requirement.id
    );
    if (configuration === undefined) {
      throw missingSecurityValuesError(requirement.id);
    }
    if (configuration.type === SecurityType.APIKEY) {
      handler = new ApiKeyHandler(configuration);
    } else if (configuration.type === SecurityType.OAUTH) {
      // handler = new OAuthHandler(configuration);
    } else if (configuration.scheme === HttpScheme.DIGEST) {
      handler = new DigestHandler(configuration);
    } else {
      handler = new HttpHandler(configuration);
    }
  }

  return handler;
}

//Different approach

// type MW = () => Promise<RequestBuilder> | RequestBuilder

// const authenticate: MW = async (handler: ISecurityHandler | undefined): Promise<RequestBuilder> => {
//   if (handler) {
//     this.parameters = await this.handler.authenticate(
//       this.parameters,
//       this.fetchInstance,
//       this.fetchInstance,
//       this.fetchRequest
//     );
//   }

//   return this;
// }

// async function pipe(parameters: RequestParameters, fetchInstance: FetchInstance & AuthCache, fetch: (
//   fetchInstance: FetchInstance,
//   request: HttpRequest,
//   fns: []
// ) => Promise<HttpResponse>): Promise<HttpResponse> {
//   const handler = getSecurityHandler(parameters.securityConfiguration ?? [], parameters.securityRequirements)

// }
