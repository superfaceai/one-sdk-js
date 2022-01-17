import { HttpScheme, SecurityType } from '@superfaceai/ast';
import { createUrl } from '../..';
import { Variables, variablesToStrings } from '../../../variables';

import {
  DEFAULT_AUTHORIZATION_HEADER_NAME,
  ISecurityHandler,
  SecurityConfiguration,
} from '../../security';
import { HttpRequest, RequestParameters } from '../interfaces';
import { encodeBody } from '../utils';

export class HttpHandler implements ISecurityHandler {
  constructor(
    readonly configuration: SecurityConfiguration & { type: SecurityType.HTTP }
  ) {}

  prepare(context: RequestParameters): HttpRequest {
    let body: Variables | undefined = context.body;
    let headers: Record<string, string> = context.headers;
    let pathParameters = context.pathParameters ?? {};

    switch (this.configuration.scheme) {
      case HttpScheme.BASIC:
        headers[DEFAULT_AUTHORIZATION_HEADER_NAME] = applyBasicAuth(
          this.configuration
        );
        break;
      case HttpScheme.BEARER:
        headers[DEFAULT_AUTHORIZATION_HEADER_NAME] = applyBearerToken(
          this.configuration
        );
        break;
    }

    const bodyAndHeaders = encodeBody(context.contentType, body, headers);

    const request: HttpRequest = {
      headers: bodyAndHeaders.headers,
      method: context.method,
      body: bodyAndHeaders.body,
      queryParameters: variablesToStrings(context.queryParameters),
      url: createUrl(context.url, {
        baseUrl: context.baseUrl,
        pathParameters,
        integrationParameters: context.integrationParameters,
      }),
    };
    return request;
  }
}

function applyBasicAuth(
  configuration: SecurityConfiguration & {
    type: SecurityType.HTTP;
    scheme: HttpScheme.BASIC;
  }
): string {
  return (
    'Basic ' +
    Buffer.from(`${configuration.username}:${configuration.password}`).toString(
      'base64'
    )
  );
}

function applyBearerToken(
  configuration: SecurityConfiguration & {
    type: SecurityType.HTTP;
    scheme: HttpScheme.BEARER;
  }
): string {
  return `Bearer ${configuration.token}`;
}
