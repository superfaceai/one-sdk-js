import type { ILogger, LogFunction } from '../../../interfaces';
import type { NonPrimitive, Result } from '../../../lib';
import { err, indexRecord, isNone, ok, recursiveKeyList } from '../../../lib';
import { invalidPathReplacementError, UnexpectedError } from '../../errors';
import type { FetchResponse, HttpMultiMap, IFetch } from './interfaces';
import type { HttpRequest } from './security';
import type { HttpResponse } from './types';

const DEBUG_NAMESPACE = 'http';
const DEBUG_NAMESPACE_SENSITIVE = 'http:sensitive';

function tryToHttpString(variable: unknown): string | undefined {
  if (typeof variable === 'string') {
    return variable;
  }

  if (typeof variable === 'number' || typeof variable === 'boolean') {
    return variable.toString();
  }

  return undefined;
}

export function variablesToHttpMap(
  variables: NonPrimitive
): Result<HttpMultiMap, [key: string, value: unknown]> {
  const result: HttpMultiMap = {};

  for (const [key, value] of Object.entries(variables)) {
    if (isNone(value)) {
      continue;
    }

    if (Array.isArray(value)) {
      // arrays are filtered, only allowing values convertible to http string
      const filtered: string[] = [];
      for (const element of value) {
        if (isNone(element)) {
          continue;
        }

        const httpVal = tryToHttpString(element);
        if (typeof httpVal === 'string') {
          filtered.push(httpVal);
        } else {
          return err([key, element]);
        }
      }

      // and only actually set the key if there is anything in the array
      if (filtered.length > 0) {
        result[key] = filtered;
      }
    } else {
      const httpValue = tryToHttpString(value);
      if (httpValue === undefined) {
        return err([key, value]);
      }

      // values convertible to http string go in
      result[key] = httpValue;
    }
  }

  return ok(result);
}

function replaceParameters(url: string, parameters: NonPrimitive) {
  let result = '';

  let lastIndex = 0;
  const allKeys: string[] = [];
  const invalidKeys: string[] = [];

  const regex = RegExp('{([^}]*)}', 'g');
  for (const match of url.matchAll(regex)) {
    const start = match.index;
    // Why can this be undefined?
    if (start === undefined) {
      throw new UnexpectedError(
        'Invalid regex match state - missing start index'
      );
    }

    const end = start + match[0].length;
    const key = match[1].trim();

    let value: string | undefined;
    try {
      value = tryToHttpString(indexRecord(parameters, key.split('.')));
    } catch (_e) {
      value = undefined;
    }

    allKeys.push(key);
    if (value === undefined) {
      invalidKeys.push(key);
      continue;
    }

    result += url.slice(lastIndex, start);
    result += value;
    lastIndex = end;
  }
  result += url.slice(lastIndex);

  if (invalidKeys.length > 0) {
    const available = recursiveKeyList(
      parameters ?? {},
      value => tryToHttpString(value) !== undefined
    );

    throw invalidPathReplacementError(invalidKeys, url, allKeys, available);
  }

  return result;
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
  const isRelative = /^\/([^/]|$)/.test(inputUrl);
  if (!isRelative) {
    throw new UnexpectedError('Expected relative url, but received absolute!');
  }

  const url = replaceParameters(inputUrl, parameters.pathParameters ?? {});

  return baseUrl.replace(/\/+$/, '') + url;
};

function logHeaders(log: LogFunction, headers: HttpMultiMap) {
  Object.entries(headers).forEach(([headerName, value]) => {
    let valueArray = value;
    if (!Array.isArray(value)) {
      valueArray = [value];
    }

    for (const val of valueArray) {
      log(`\t${headerName}: ${val}`);
    }
  });
}
function logRequest(log: LogFunction, request: HttpRequest) {
  let url = request.url;
  if (
    request.queryParameters !== undefined &&
    Object.keys(request.queryParameters).length > 0
  ) {
    const searchParams = new URLSearchParams(request.queryParameters);
    url = `${url}?${searchParams.toString()}`;
  }

  log(`\t${request.method} ${url} HTTP/1.1`);
  logHeaders(log, request.headers ?? {});

  if (request.body !== undefined) {
    log('\n\t%O', request.body);
  }
}
function logResponse(log: LogFunction, response: FetchResponse) {
  log(`\tHTTP/1.1 ${response.status} ${response.statusText}`);
  logHeaders(log, response.headers);
  log('\n\t%j\n', response.body);
}

export async function fetchRequest(
  fetchInstance: IFetch,
  request: HttpRequest,
  logger?: ILogger
): Promise<HttpResponse> {
  const log = logger?.log(DEBUG_NAMESPACE);
  const logSensitive = logger?.log(DEBUG_NAMESPACE_SENSITIVE);
  log?.('Executing HTTP Call');
  if (logSensitive?.enabled === true) {
    // secrets might appear in headers, url path, query parameters or body
    logRequest(logSensitive, request);
  }

  const response = await fetchInstance.fetch(request.url, request);

  log?.('Received response');
  if (logSensitive?.enabled === true) {
    logResponse(logSensitive, response);
  }

  return {
    statusCode: response.status,
    body: response.body,
    headers: response.headers,
    debug: {
      request: {
        url: request.url,
        headers: response.headers,
        body: request.body,
      },
    },
  };
}

// TODO: where is this actually used?
/**
 * Get header value. For duplicate headers all delimited by `,` are returned
 */
export function getHeader(headers: NonPrimitive, headerName: string): string {
  const values = Object.entries(headers)
    .flatMap(([key, value]) => {
      if (key.toLowerCase() === headerName.toLowerCase()) {
        return value;
      }

      return undefined;
    })
    .filter(value => value !== undefined);

  return values.join(', ');
}

/**
 * Checks in case-insensitive way if the given header is present
 */
export function hasHeader(headers: NonPrimitive, headerName: string): boolean {
  return Object.keys(headers).some(
    header => header.toLowerCase() === headerName.toLowerCase()
  );
}

export function setHeader(
  headers: NonPrimitive,
  headerName: string,
  value: string
): void {
  if (!hasHeader(headers, headerName)) {
    headers[headerName] = value;
  }
}

/**
 * Deletes header
 */
export function deleteHeader(headers: NonPrimitive, headerName: string): void {
  Object.keys(headers).forEach(header => {
    if (header.toLowerCase() === headerName.toLowerCase()) {
      delete headers[header];
    }
  });
}

/** Returns case-insensitive header value(s) from multimap. */
export function getHeaderMulti(
  map: HttpMultiMap,
  headerKey: string
): string[] | undefined {
  for (const [key, value] of Object.entries(map)) {
    if (key.toLowerCase() === headerKey.toLowerCase()) {
      if (!Array.isArray(value)) {
        return [value];
      } else {
        return value;
      }
    }
  }

  return undefined;
}
