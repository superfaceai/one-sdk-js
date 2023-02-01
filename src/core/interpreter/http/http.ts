import type { HttpSecurityRequirement } from '@superfaceai/ast';
import { HttpScheme, SecurityType } from '@superfaceai/ast';

import type { ICrypto, ILogger } from '../../../interfaces';
import type { NonPrimitive, Variables } from '../../../lib';
import { UnexpectedError } from '../../../lib';
import { pipe } from '../../../lib/pipe/pipe';
import {
  invalidHTTPMapValueType,
  missingSecurityValuesError,
} from '../../errors';
import {
  authenticateFilter,
  fetchFilter,
  handleResponseFilter,
  prepareRequestFilter,
  withRequest,
  withResponse,
} from './filters';
import type { IFetch } from './interfaces';
import type {
  AuthCache,
  ISecurityHandler,
  RequestParameters,
  SecurityConfiguration,
} from './security';
import { ApiKeyHandler, DigestHandler, HttpHandler } from './security';
import type { HttpResponse } from './types';
import { variablesToHttpMap } from './utils';

export enum NetworkErrors {
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
}

export class HttpClient {
  constructor(
    private fetchInstance: IFetch & AuthCache,
    private readonly crypto: ICrypto,
    private readonly logger?: ILogger
  ) {}

  public async request(
    url: string,
    parameters: {
      method: string;
      headers?: NonPrimitive;
      queryParameters?: NonPrimitive;
      body?: Variables;
      contentType?: string;
      accept?: string;
      securityRequirements?: HttpSecurityRequirement[];
      securityConfiguration?: SecurityConfiguration[];
      baseUrl: string;
      pathParameters?: NonPrimitive;
      integrationParameters?: Record<string, string>;
    }
  ): Promise<HttpResponse> {
    const requestParameters: RequestParameters = {
      url,
      ...parameters,
      queryParameters: variablesToHttpMap(
        parameters.queryParameters ?? {}
      ).match(
        v => v,
        ([key, value]) => {
          throw invalidHTTPMapValueType('query parameter', key, typeof value);
        }
      ),
      headers: variablesToHttpMap(parameters.headers ?? {}).match(
        v => v,
        ([key, value]) => {
          throw invalidHTTPMapValueType('header', key, typeof value);
        }
      ),
    };

    const handler = createSecurityHandler(
      this.fetchInstance,
      requestParameters.securityConfiguration,
      requestParameters.securityRequirements,
      this.crypto,
      this.logger
    );

    const result = await pipe(
      {
        parameters: requestParameters,
      },
      authenticateFilter(handler),
      prepareRequestFilter,
      withRequest(fetchFilter(this.fetchInstance, this.logger)),
      withResponse(
        handleResponseFilter(this.fetchInstance, this.logger, handler)
      )
    );

    if (result.response === undefined) {
      throw new UnexpectedError('Response is undefined');
    }

    return result.response;
  }
}

function createSecurityHandler(
  fetchInstance: IFetch & AuthCache,
  securityConfiguration: SecurityConfiguration[] = [],
  securityRequirements: HttpSecurityRequirement[] = [],
  crypto: ICrypto,
  logger?: ILogger
): ISecurityHandler | undefined {
  let handler: ISecurityHandler | undefined = undefined;
  for (const requirement of securityRequirements) {
    const configuration = securityConfiguration.find(
      configuration => configuration.id === requirement.id
    );
    if (configuration === undefined) {
      throw missingSecurityValuesError(requirement.id);
    }
    if (configuration.type === SecurityType.APIKEY) {
      handler = new ApiKeyHandler(configuration, logger);
    } else if (configuration.scheme === HttpScheme.DIGEST) {
      handler = new DigestHandler(configuration, fetchInstance, crypto, logger);
    } else {
      handler = new HttpHandler(configuration, logger);
    }
  }

  return handler;
}
