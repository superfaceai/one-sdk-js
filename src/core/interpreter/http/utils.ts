import type { ILogger } from '../../../interfaces';
import type { NonPrimitive } from '../../../lib';
import {
  getValue,
  recursiveKeyList,
  UnexpectedError,
  variableToString,
} from '../../../lib';
import { missingPathReplacementError } from '../../errors';
import type { IFetch } from './interfaces';
import type { HttpRequest } from './security';
import type { HttpResponse } from './types';

const DEBUG_NAMESPACE = 'http';
const DEBUG_NAMESPACE_SENSITIVE = 'http:sensitive';

function replaceParameters(url: string, parameters: NonPrimitive) {
  let result = '';

  let lastIndex = 0;
  const allKeys: string[] = [];
  const missingKeys: string[] = [];

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
    const value = getValue(parameters, key.split('.'));

    allKeys.push(key);
    if (value === undefined) {
      missingKeys.push(key);
      continue;
    }

    result += url.slice(lastIndex, start);
    result += variableToString(value);
    lastIndex = end;
  }
  result += url.slice(lastIndex);

  if (missingKeys.length > 0) {
    const available = recursiveKeyList(parameters ?? {});

    throw missingPathReplacementError(missingKeys, url, allKeys, available);
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
  const isRelative = /^\/[^/]/.test(inputUrl);
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
    const hasSearchParams =
      Object.keys(request.queryParameters || {}).length > 0;
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

export function hasAcceptHeader(headers: NonPrimitive): boolean {
  return Object.keys(headers).some(
    header => header.toLowerCase() === 'accept'
  );
}
