import 'isomorphic-form-data';

import fetch, { Headers } from 'cross-fetch';

import { NetworkErrors } from '../internal/interpreter/http';
import {
  FetchBody,
  FetchInstance,
  FetchParameters,
  FetchResponse,
  isFormDataBody,
  isStringBody,
  isUrlSearchParamsBody,
  JSON_CONTENT,
} from '../internal/interpreter/http/interfaces';
import {
  eventInterceptor,
  Interceptable,
  InterceptableMetadata,
} from './events';

export class CrossFetch implements FetchInstance, Interceptable {
  public metadata: InterceptableMetadata | undefined;

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

    console.log('cross fetch metadata', this.metadata, 'params', parameters);
    const request: RequestInit = {
      headers: new Headers(headersInit),
      method: parameters.method,
      body: this.body(parameters.body),
    };

    const response = await this.timeout(
      fetch(
        url + this.queryParameters(parameters.queryParameters),
        request
        //TODO: pass timeout from params, use different value
      ),
      parameters.timeout
    );

    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    let body: unknown;

    if (
      (headers['content-type'] &&
        headers['content-type'].includes(JSON_CONTENT)) ||
      parameters.headers?.['accept']?.includes(JSON_CONTENT)
    ) {
      body = await response.json();
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

  //TODO: rewrite
  private async timeout<T>(promise: Promise<T>, timeout = 5000) {
    const timer = new Promise<{ timeout: boolean }>(resolve => {
      setTimeout(resolve, timeout, {
        timeout: true,
      });
    });
    const response = await Promise.race([promise, timer]);
    if ('timeout' in response && response.timeout) {
      throw NetworkErrors.TIMEOUT_ERROR;
    }

    return response as T;
  }
  // private async timeout<T>(promise: Promise<T>, timeout = 5000): Promise<T> {
  //   console.log('time out', timeout)
  //   return new Promise((resolve, reject) => {
  //     setTimeout(() => {
  //       reject(NetworkErrors.TIMEOUT_ERROR)
  //     }, timeout)
  //     promise.then(resolve, reject)
  //   })
  // }

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

  private body(body?: FetchBody): string | FormData | undefined {
    if (body) {
      if (isStringBody(body)) {
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
}
