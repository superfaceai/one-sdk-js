import { HttpScheme, SecurityType } from '@superfaceai/ast';

import { ILogger, LogFunction } from '~core';

import {
  DEFAULT_AUTHORIZATION_HEADER_NAME,
  ISecurityHandler,
  SecurityConfiguration,
} from '../../security';
import { AuthenticateRequestAsync, RequestParameters } from '../interfaces';

const DEBUG_NAMESPACE = 'http:security:http-handler';

export class HttpHandler implements ISecurityHandler {
  private log?: LogFunction | undefined;
  constructor(
    public readonly configuration: SecurityConfiguration & {
      type: SecurityType.HTTP;
    },
    logger?: ILogger
  ) {
    this.log = logger?.log(DEBUG_NAMESPACE);
    this.log?.('Initialized http authentization handler');
  }

  public authenticate: AuthenticateRequestAsync = async (
    parameters: RequestParameters
  ) => {
    const headers: Record<string, string> = parameters.headers || {};

    switch (this.configuration.scheme) {
      case HttpScheme.BASIC:
        this.log?.('Setting basic http auhentization');

        headers[DEFAULT_AUTHORIZATION_HEADER_NAME] = applyBasicAuth(
          this.configuration
        );
        break;
      case HttpScheme.BEARER:
        this.log?.('Setting bearer http auhentization');

        headers[DEFAULT_AUTHORIZATION_HEADER_NAME] = applyBearerToken(
          this.configuration
        );
        break;
    }

    return {
      ...parameters,
      headers,
    };
  };
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
