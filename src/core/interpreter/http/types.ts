import type { HttpMultiMap } from './interfaces';

export interface HttpResponse {
  statusCode: number;
  body: unknown;
  headers: HttpMultiMap;
  debug: {
    request: {
      headers: HttpMultiMap;
      url: string;
      body: unknown;
    };
  };
}
