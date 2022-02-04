import { HttpScheme, SecurityType } from '@superfaceai/ast';
import createDebug from 'debug';

import { FetchInstance } from '../../interfaces';
import { headersFilter, pipe, prepareRequestFilter } from '../../pipe';
import {
  DEFAULT_AUTHORIZATION_HEADER_NAME,
  ISecurityHandler,
  SecurityConfiguration,
} from '../../security';
import {
  AuthCache,
  AuthenticateRequestAsync,
  RequestParameters,
} from '../interfaces';

const debug = createDebug('superface:http:security:http-handler');

export class HttpHandler implements ISecurityHandler {
  constructor(
    readonly configuration: SecurityConfiguration & { type: SecurityType.HTTP }
  ) {
    debug('Initialized http authentization handler');
  }

  authenticate: AuthenticateRequestAsync = async (
    parameters: RequestParameters,
    fetchInstance: FetchInstance & AuthCache
  ) => {
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

    const prepared = await pipe({
      parameters: {
        ...parameters,
        headers,
      },
      fetchInstance,
      handler: undefined,
      filters: [headersFilter, prepareRequestFilter],
    });

    if (!prepared.request) {
      throw new Error('Request not defined');
    }

    return prepared.request;
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
