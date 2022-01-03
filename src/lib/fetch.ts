import 'isomorphic-form-data';

import { AbortController } from 'abort-controller';
import fetch, { Headers } from 'cross-fetch';

import {
  BINARY_CONTENT_REGEXP,
  FetchBody,
  FetchInstance,
  FetchParameters,
  FetchResponse,
  isBinaryBody,
  isFormDataBody,
  isStringBody,
  isUrlSearchParamsBody,
  JSON_CONTENT,
} from '../internal/interpreter/http/interfaces';
import {
  eventInterceptor,
  Events,
  Interceptable,
  InterceptableMetadata,
} from './events';
import {
  CrossFetchError,
  NetworkFetchError,
  RequestFetchError,
} from './fetch.errors';

export class CrossFetch implements FetchInstance, Interceptable {
  public metadata: InterceptableMetadata | undefined;
  public events: Events | undefined;

  @eventInterceptor({
    eventName: 'fetch',
    placement: 'around',
  })
  async fetch(
    url: string,
    parameters: FetchParameters
  ): Promise<FetchResponse> {
    const headersInit = parameters.headers
      ? Object.entries(parameters.headers).map(([key, value]) => [
        key,
        ...(Array.isArray(value) ? value : [value]),
      ])
      : undefined;
    const request: RequestInit = {
      headers: new Headers(headersInit),
      method: parameters.method,
      body: this.body(parameters.body),
    };

    const response = await CrossFetch.fetchWithTimeout(
      url + this.queryParameters(parameters.queryParameters),
      request,
      parameters.timeout
    );

    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    let body: unknown;

    if (
      (headers['content-type'] &&
        headers['content-type'].includes(JSON_CONTENT)) //||
      //This should be used when we don't have a response content-type
      // parameters.headers?.['accept']?.includes(JSON_CONTENT)
    ) {
      console.log('IS JSON', response)
      body = await response.json();
    } else if (this.isBinaryContent(headers, parameters.headers)) {
      body = await response.arrayBuffer();
    } else {
      body = await response.text();
    }

    return {
      status: response.status,
      statusText: response.statusText,
      headers,
      body,
    };
  }

  private static async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeout?: number
  ): Promise<Response> {
    const abort = new AbortController();

    let timeoutHandle = undefined;
    if (timeout !== undefined) {
      timeoutHandle = setTimeout(() => abort.abort(), timeout);
    }
    options.signal = abort.signal;

    try {
      return await fetch(url, options);
    } catch (err: unknown) {
      throw CrossFetch.normalizeError(err);
    } finally {
      if (timeoutHandle !== undefined) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  private static normalizeError(err: unknown): CrossFetchError {
    if (typeof err !== 'object' || err === null) {
      throw err;
    }

    if (!('type' in err)) {
      throw err;
    }

    const error: { type: string } = err as { type: string };
    if (error.type === 'aborted') {
      return new NetworkFetchError('timeout');
    }

    if (error.type === 'system') {
      const systemError: { type: 'system'; code: string; errno: string } =
        error as { type: 'system'; code: string; errno: string };

      if (
        systemError.code === 'ENOTFOUND' ||
        systemError.code === 'EAI_AGAIN'
      ) {
        return new NetworkFetchError('dns');
      }

      // TODO: unsigned ssl?

      return new NetworkFetchError('reject');
    }

    // TODO: Match other errors here
    return new RequestFetchError('abort');
  }

  private queryParameters(parameters?: Record<string, string>): string {
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
  }

  private body(body?: FetchBody): string | FormData | Buffer | undefined {
    if (body) {
      if (isStringBody(body) || isBinaryBody(body)) {
        return body.data;
      }

      if (isFormDataBody(body)) {
        return this.formData(body.data);
      }

      if (isUrlSearchParamsBody(body)) {
        return this.urlSearchParams(body.data);
      }
    }

    return undefined;
  }

  private formData(data?: Record<string, string>): FormData {
    const formData = new FormData();

    if (data) {
      Object.entries(data).forEach(([key, value]) =>
        formData.append(key, value)
      );
    }

    return formData;
  }

  private urlSearchParams(data?: Record<string, string>): URLSearchParams {
    return new URLSearchParams(data);
  }

  private isBinaryContent(
    responseHeaders: Record<string, string>,
    requestHeaders?: Record<string, string | string[]>
  ): boolean {
    if (
      responseHeaders['content-type'] &&
      BINARY_CONTENT_REGEXP.test(responseHeaders['content-type'])
    ) {
      return true;
    }

    if (requestHeaders && requestHeaders['accept']) {
      if (typeof requestHeaders['accept'] === 'string') {
        return BINARY_CONTENT_REGEXP.test(requestHeaders['accept']);
      } else {
        for (const value of requestHeaders['accept']) {
          if (BINARY_CONTENT_REGEXP.test(value)) {
            return true;
          }
        }
      }
    }

    return false;
  }
}
