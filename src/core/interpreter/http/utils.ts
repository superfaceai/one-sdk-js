import type { ILogger } from '../../../interfaces';
import type {
  NonPrimitive,
  Result
} from '../../../lib';
import { err,
  indexRecord,
  isNone,   ok,   recursiveKeyList,   UnexpectedError,
  variableToString} from '../../../lib';
import { invalidPathReplacementError } from '../../errors';
import type { IFetch } from './interfaces';
import type { HttpRequest } from './security';
import type { HttpResponse } from './types';

const DEBUG_NAMESPACE = 'http';
const DEBUG_NAMESPACE_SENSITIVE = 'http:sensitive';

export function variablesToHttpMap(variables: NonPrimitive): Result<Record<string, string | string[]>, [key: string, value: unknown]> {
  const result: Record<string, string | string[]> = {};

  for (const [key, value] of Object.entries(variables)) {
    if (typeof value === 'string') {
      result[key] = value;
    } else if (Array.isArray(value)) {
      const filtered: string[] = [];
      for (const val of value) {
        if (typeof val === 'string') {
          filtered.push(val);
        } else if (!isNone(val)) {
          return err([key, val]);
        }
      }

      if (filtered.length > 0) {
        result[key] = filtered;
      }
    } else if (!isNone(value)) {
      return err([key, value]);
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

    let value;
    try {
      value = indexRecord(parameters, key.split('.'));
    } catch (_e) {
      value = undefined;
    }

    allKeys.push(key);
    if (typeof value !== 'string') {
      invalidKeys.push(key);
      continue;
    }

    result += url.slice(lastIndex, start);
    result += variableToString(value);
    lastIndex = end;
  }
  result += url.slice(lastIndex);

  if (invalidKeys.length > 0) {
    const available = recursiveKeyList(parameters ?? {}, value => typeof value === 'string');

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

export async function fetchRequest(
  fetchInstance: IFetch,
  request: HttpRequest,
  logger?: ILogger
): Promise<HttpResponse> {
  const log = logger?.log(DEBUG_NAMESPACE);
  const logSensitive = logger?.log(DEBUG_NAMESPACE_SENSITIVE);
  log?.('Executing HTTP Call');
  // secrets might appear in headers, url path, query parameters or body
  if (logSensitive?.enabled === true) {
    const hasSearchParams = Object.keys(
      request.queryParameters ?? {}
    ).length > 0;
    const searchParams = new URLSearchParams(request.queryParameters);
    logSensitive(
      '\t%s %s%s HTTP/1.1',
      request.method || 'UNKNOWN METHOD',
      request.url,
      hasSearchParams ? '?' + searchParams.toString() : ''
    );
    Object.entries(request.headers || {}).forEach(([headerName, value]) =>
      logSensitive(
        `\t${headerName}: ${Array.isArray(value) ? value.join(', ') : value}`
      )
    );
    if (request.body !== undefined) {
      logSensitive('\n%O', request.body);
    }
  }

  const response = await fetchInstance.fetch(request.url, request);

  log?.('Received response');
  if (logSensitive?.enabled === true) {
    logSensitive(`\tHTTP/1.1 ${response.status} ${response.statusText}`);
    Object.entries(response.headers).forEach(([headerName, value]) =>
      logSensitive(`\t${headerName}: ${value}`)
    );
    logSensitive('\n\t%j', response.body);
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
