import { unsupportedContentType } from '../../../errors.helpers';
import { Variables, variablesToStrings } from '../../variables';
import { createUrl } from '../http';
import {
  BINARY_CONTENT_REGEXP,
  BINARY_CONTENT_TYPES,
  binaryBody,
  FetchBody,
  FORMDATA_CONTENT,
  formDataBody,
  JSON_CONTENT,
  stringBody,
  URLENCODED_CONTENT,
  urlSearchParamsBody,
} from '../interfaces';
import { HttpRequest, RequestParameters } from './interfaces';

export function encodeBody(
  contentType: string | undefined,
  body: Variables | undefined,
  headers: Record<string, string>
): { body: FetchBody | undefined; headers: Record<string, string> } {
  const finalHeaders = headers;
  let finalBody: FetchBody | undefined;
  if (body) {
    if (contentType === JSON_CONTENT) {
      finalHeaders['Content-Type'] ??= JSON_CONTENT;
      finalBody = stringBody(JSON.stringify(body));
    } else if (contentType === URLENCODED_CONTENT) {
      finalHeaders['Content-Type'] ??= URLENCODED_CONTENT;
      finalBody = urlSearchParamsBody(variablesToStrings(body));
    } else if (contentType === FORMDATA_CONTENT) {
      finalHeaders['Content-Type'] ??= FORMDATA_CONTENT;
      finalBody = formDataBody(variablesToStrings(body));
    } else if (contentType && BINARY_CONTENT_REGEXP.test(contentType)) {
      headers['Content-Type'] ??= contentType;
      let buffer: Buffer;
      if (Buffer.isBuffer(body)) {
        buffer = body;
      } else {
        //coerce to string then buffer
        buffer = Buffer.from(String(body));
      }
      finalBody = binaryBody(buffer);
    } else {
      const supportedTypes = [
        JSON_CONTENT,
        URLENCODED_CONTENT,
        FORMDATA_CONTENT,
        ...BINARY_CONTENT_TYPES,
      ];

      throw unsupportedContentType(contentType ?? '', supportedTypes);
    }
  }

  return { body: finalBody, headers: finalHeaders };
}

export function prepareRequest(parameters: RequestParameters): HttpRequest {
  const body: Variables | undefined = parameters.body;
  const headers: Record<string, string> = parameters.headers;
  const pathParameters = parameters.pathParameters ?? {};

  const bodyAndHeaders = encodeBody(parameters.contentType, body, headers);

  const request: HttpRequest = {
    headers: bodyAndHeaders.headers,
    method: parameters.method,
    body: bodyAndHeaders.body,
    queryParameters: variablesToStrings(parameters.queryParameters),
    url: createUrl(parameters.url, {
      baseUrl: parameters.baseUrl,
      pathParameters,
      integrationParameters: parameters.integrationParameters,
    }),
  };

  return request;
}
