import 'isomorphic-form-data';

import fetch, { Headers } from 'cross-fetch';

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
import { eventInterceptor, Interceptable } from './events';

export class CrossFetch implements FetchInstance, Interceptable {
  public metadata: { usecase: string; profile: string } | undefined;

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

    const response = await fetch(
      url + this.queryParameters(parameters.queryParameters),
      request
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
