import { HttpScheme, SecurityType } from '@superfaceai/ast';

import {
  DEFAULT_AUTHORIZATION_HEADER_NAME,
  ISecurityHandler,
  SecurityConfiguration,
} from '../../security';
import { HttpRequest, RequestParameters } from '../interfaces';
import { prepareRequest } from '../utils';

export class HttpHandler implements ISecurityHandler {
  constructor(
    readonly configuration: SecurityConfiguration & { type: SecurityType.HTTP }
  ) {}

  authenticate(parameters: RequestParameters): HttpRequest {
    const headers: Record<string, string> = parameters.headers || {};

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

    return prepareRequest({
      ...parameters,
      headers,
    });
  }

  // handle(
  //   _response: HttpResponse,
  //   _resourceRequestParameters: RequestParameters,
  //   _cache: AuthCache
  // ): AffterHookAuthResult {
  //   return { kind: 'continue' };
  // }

  // prepare(parameters: RequestParameters): BeforeHookAuthResult {
  //   const headers: Record<string, string> = parameters.headers;

  //   switch (this.configuration.scheme) {
  //     case HttpScheme.BASIC:
  //       headers[DEFAULT_AUTHORIZATION_HEADER_NAME] = applyBasicAuth(
  //         this.configuration
  //       );
  //       break;
  //     case HttpScheme.BEARER:
  //       headers[DEFAULT_AUTHORIZATION_HEADER_NAME] = applyBearerToken(
  //         this.configuration
  //       );
  //       break;
  //   }

  //   const request: RequestParameters = {
  //     ...parameters,
  //     headers,
  //   };

  //   return { kind: 'modify', newArgs: [request] };
  // }
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
