import { HttpScheme,SecurityType } from '@superfaceai/ast';

import {
  DEFAULT_AUTHORIZATION_HEADER_NAME,
  ISecurityHandler,
  RequestContext,
  SecurityConfiguration,
} from '../../security';

export class HttpHandler implements ISecurityHandler {
  constructor(
    readonly configuration: SecurityConfiguration & { type: SecurityType.HTTP }
  ) {}

  prepare(context: RequestContext): void {
    switch (this.configuration.scheme) {
      case HttpScheme.BASIC:
        applyBasicAuth(context, this.configuration);
        break;
      case HttpScheme.BEARER:
        applyBearerToken(context, this.configuration);
        break;
    }
  }
}

function applyBasicAuth(
  context: RequestContext,
  configuration: SecurityConfiguration & {
    type: SecurityType.HTTP;
    scheme: HttpScheme.BASIC;
  }
): void {
  context.headers[DEFAULT_AUTHORIZATION_HEADER_NAME] =
    'Basic ' +
    Buffer.from(`${configuration.username}:${configuration.password}`).toString(
      'base64'
    );
}

function applyBearerToken(
  context: RequestContext,
  configuration: SecurityConfiguration & {
    type: SecurityType.HTTP;
    scheme: HttpScheme.BEARER;
  }
): void {
  context.headers[
    DEFAULT_AUTHORIZATION_HEADER_NAME
  ] = `Bearer ${configuration.token}`;
}
