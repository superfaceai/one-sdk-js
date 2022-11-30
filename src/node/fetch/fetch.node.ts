import { AbortController } from 'abort-controller';
import FormData from 'form-data';
import type { HeadersInit, RequestInit, Response } from 'node-fetch';
import fetch, { Headers } from 'node-fetch';
import type { Readable } from 'stream';

import type {
  AuthCache,
  Events,
  FetchBody,
  FetchError,
  FetchResponse,
  IFetch,
  Interceptable,
  InterceptableMetadata,
  ITimers} from '../../core';
import {
  BINARY_CONTENT_REGEXP,
  FetchParameters,
  isBinaryBody,
  isBinaryData,
  isBinaryFileMeta,
  isFormDataBody,
  isStringBody,
  isUrlSearchParamsBody,
  JSON_CONTENT,
  JSON_PROBLEM_CONTENT,
  NetworkFetchError,
  RequestFetchError,
} from '../../core';
import { eventInterceptor } from '../../core/events/events';
import { SuperCache } from '../../lib';

export class NodeFetch implements IFetch, Interceptable, AuthCache {
  public metadata: InterceptableMetadata | undefined;
  public events: Events | undefined;
  public digest: SuperCache<string> = new SuperCache();

  constructor(private readonly timers: ITimers) {}

  @eventInterceptor({
    eventName: 'fetch',
    placement: 'around',
  })
  public async fetch(
    url: string,
    parameters: FetchParameters
  ): Promise<FetchResponse> {
    const headersInit = this.prepareHeadersInit(parameters.headers);

    const request: RequestInit = {
      headers: new Headers(headersInit),
      method: parameters.method,
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore https://github.com/form-data/form-data/issues/513
      body: this.body(parameters.body),
    };

    const response = await this.fetchWithTimeout(
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
      headers['content-type'] &&
      (headers['content-type'].includes(JSON_CONTENT) ||
        headers['content-type'].includes(JSON_PROBLEM_CONTENT)) // ||
      // TODO: update this when we have security handlers preparing whole requests
      // parameters.headers?.['accept']?.includes(JSON_CONTENT)
    ) {
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

  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeout?: number
  ): Promise<Response> {
    const abort = new AbortController();

    let timeoutHandle = undefined;
    if (timeout !== undefined) {
      timeoutHandle = this.timers.setTimeout(() => abort.abort(), timeout);
    }
    options.signal = abort.signal;

    try {
      return await fetch(url, options);
    } catch (err: unknown) {
      throw NodeFetch.normalizeError(err);
    } finally {
      if (timeoutHandle !== undefined) {
        this.timers.clearTimeout(timeoutHandle);
      }
    }
  }

  private static normalizeError(err: unknown): FetchError {
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

  private body(
    body?: FetchBody
  ): string | URLSearchParams | FormData | Buffer | Readable | undefined {
    if (body) {
      if (isStringBody(body) || isBinaryBody(body)) {
        if (isBinaryData(body.data)) {
          return body.data.toStream();
        }

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

  private formData(data?: Record<string, unknown>): FormData {
    const formData = new FormData();

    if (data) {
      Object.entries(data).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          value.forEach(item => formData.append(key, item));
        } else if (isBinaryData(value)) {
          if (isBinaryFileMeta(value)) {
            formData.append(key, value.toStream(), { contentType: value.mimetype, filename: value.filename });
          } else {
            formData.append(key, value.toStream());
          }
        } else {
          formData.append(key, value);
        }
      });
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

    if (
      requestHeaders !== undefined &&
      requestHeaders['accept'] !== undefined
    ) {
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

  private prepareHeadersInit(data: FetchParameters['headers'] | undefined): HeadersInit {
    if (data === undefined) {
      return [];
    }

    const headers: [string, string][] = [];

    Object.entries(data).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((val) => headers.push([key, val]));
      } else {
        headers.push([key, value]);
      }
    });

    return headers;
  }
}
