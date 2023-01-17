import { AbortController } from 'abort-controller';
import FormData from 'form-data';
import type { RequestInit, Response } from 'node-fetch';
import fetch, { Headers } from 'node-fetch';

import type {
  AuthCache,
  Events,
  FetchBody,
  FetchError,
  FetchResponse,
  HttpMultiMap,
  IFetch,
  Interceptable,
  InterceptableMetadata,
  ITimers
} from '../../core';
import {
  BINARY_CONTENT_REGEXP,
  FetchParameters,
  getHeaderMulti,
  isBinaryBody,
  isBinaryData,
  isBinaryDataMeta,
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
  private static multimapToHeaders(map: HttpMultiMap | undefined): Headers {
    const headers = new Headers();

    if (map === undefined) {
      return headers;
    }

    for (const [key, value] of Object.entries(map)) {
      let valueArray = value;
      if (!Array.isArray(value)) {
        valueArray = [value];
      }

      for (const element of valueArray) {
        headers.append(key, element);
      }
    }

    return headers;
  }

  private static isJsonContentType(
    contentType: string[] | undefined,
    _accept: string[] | undefined
  ): boolean {
    if (
      contentType !== undefined
      && contentType.some(v => v.includes(JSON_CONTENT) || v.includes(JSON_PROBLEM_CONTENT))
    ) {
      return true;
    }

    return false;
  }

  private static isBinaryContentType(
    contentType: string[] | undefined,
    accept: string[] | undefined
  ): boolean {
    if (
      contentType !== undefined
      && contentType.some(v => BINARY_CONTENT_REGEXP.test(v))
    ) {
      return true;
    }

    if (
      accept !== undefined
      && accept.some(v => BINARY_CONTENT_REGEXP.test(v))
    ) {
      return true;
    }

    return false;
  }
  
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
    const requestHeaders = NodeFetch.multimapToHeaders(parameters.headers);
    const request: RequestInit = {
      headers: requestHeaders,
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

    const headers: HttpMultiMap = {};
    // headers.raw() returns an object with prototype set to null for some reason, so we need to rewrap the values
    for (const [key, value] of Object.entries(response.headers.raw())) {
      if (value.length > 1) {
        headers[key] = value;
      } else if (value.length === 1) {
        headers[key] = value[0];
      }
    }

    let body: unknown;

    const contentType = getHeaderMulti(headers, 'content-type');
    const accept = getHeaderMulti(requestHeaders.raw(), 'accept');
    if (NodeFetch.isJsonContentType(contentType, accept)) {
      body = await response.json();
    } else if (NodeFetch.isBinaryContentType(contentType, accept)) {
      body = await response.arrayBuffer(); // TODO: BinaryData.fromStream(response.body)
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

  private queryParameters(parameters?: HttpMultiMap): string {
    if (parameters === undefined || Object.keys(parameters).length === 0) {
      return '';
    }

    const params = new URLSearchParams();
    for (const [key, param] of Object.entries(parameters)) {
      if (typeof param === 'string') {
        params.append(key, param);
      } else {
        param.forEach(v => params.append(key, v));
      }
    }

    return '?' + params.toString();
  }

  private body(
    body?: FetchBody
  ): string | URLSearchParams | FormData | Buffer | NodeJS.ReadableStream | undefined {
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
          if (isBinaryDataMeta(value)) {
            formData.append(key, value.toStream(), { contentType: value.mimetype, filename: value.name });
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
}
