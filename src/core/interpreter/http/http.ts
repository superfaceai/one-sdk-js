import {
  HttpScheme,
  HttpSecurityRequirement,
  SecurityType,
} from '@superfaceai/ast';

import { pipe } from '../../../lib/pipe/pipe';
import { missingSecurityValuesError, UnexpectedError } from '../../errors';
import { ICrypto, ILogger } from '../../interfaces';
import { NonPrimitive, Variables, variablesToStrings } from '../variables';
import {
  authenticateFilter,
  fetchFilter,
  handleResponseFilter,
  prepareRequestFilter,
  withRequest,
  withResponse,
} from './filters';
import { IFetch } from './interfaces';
import {
  ApiKeyHandler,
  AuthCache,
  DigestHandler,
  HttpHandler,
  ISecurityHandler,
  RequestParameters,
  SecurityConfiguration,
} from './security';
import { HttpResponse } from './types';

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
      headers?: Variables;
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
      headers: variablesToStrings(parameters?.headers),
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
