import { HttpScheme, SecurityType } from '@superfaceai/ast';
import createDebug from 'debug';

import {
  pipe,
  bodyFilter,
  headersFilter,
  methodFilter,
  queryParametersFilter,
  urlFilter,
} from '../../pipe';
import {
  DEFAULT_AUTHORIZATION_HEADER_NAME,
  ISecurityHandler,
  SecurityConfiguration,
} from '../../security';
import { AuthenticateRequestAsync, RequestParameters } from '../interfaces';

const debug = createDebug('superface:http:security:http-handler');

export class HttpHandler implements ISecurityHandler {
  constructor(
    readonly configuration: SecurityConfiguration & { type: SecurityType.HTTP }
  ) {
    debug('Initialized http authentization handler');
  }

  authenticate: AuthenticateRequestAsync = (parameters: RequestParameters) => {
    const headers: Record<string, string> = parameters.headers || {};

    switch (this.configuration.scheme) {
      case HttpScheme.BASIC:
        debug('Setting basic http auhentization');

        headers[DEFAULT_AUTHORIZATION_HEADER_NAME] = applyBasicAuth(
          this.configuration
        );
        break;
      case HttpScheme.BEARER:
        debug('Setting bearer http auhentization');

        headers[DEFAULT_AUTHORIZATION_HEADER_NAME] = applyBearerToken(
          this.configuration
        );
        break;
    }

    return pipe({
      parameters: {
        ...parameters,
        headers,
      },
      filters: [
        headersFilter,
        bodyFilter,
        queryParametersFilter,
        methodFilter,
        urlFilter,
      ],
    });
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
