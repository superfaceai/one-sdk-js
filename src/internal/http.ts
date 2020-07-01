import fetch from 'cross-fetch';

export interface HttpResponse {
  statusCode: number;
  body: unknown;
}

export const HttpClient = {
  request: async (
    url: string,
    parameters: {
      method: string;
      headers?: Record<string, string>;
      queryParameters?: Record<string, string>;
      body?: unknown;
    }
  ): Promise<HttpResponse> => {
    let query = '';

    if (
      parameters?.queryParameters &&
      Object.keys(parameters.queryParameters).length
    ) {
      query =
        '?' +
        Object.entries(parameters.queryParameters)
          .map(([key, value]) => `${key}=${value}`)
          .join('&');
    }

    const params: RequestInit = {
      headers: { 'Content-Type': 'application/json', ...parameters?.headers },
      method: parameters.method,
    };

    if (
      parameters.method.toLowerCase() !== 'get' &&
      parameters.method.toLowerCase() !== 'head' &&
      parameters.body
    ) {
      params.body = JSON.stringify(parameters.body);
    }

    const response = await fetch(encodeURI(`${url}${query}`), params);

    return {
      statusCode: response.status,
      body: await response.json(),
    };
  },
};
