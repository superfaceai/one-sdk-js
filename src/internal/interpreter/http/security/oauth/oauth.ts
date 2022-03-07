import {
  OAuthFlow,
  OAuthSecurityScheme,
  OAuthSecurityValues,
} from '@superfaceai/ast';
import createDebug from 'debug';

import { isCompleteHttpRequest, prepareRequestFilter } from '../../filters';
import { HttpResponse } from '../../http';
import { FetchInstance } from '../../interfaces';
import {
  AuthCache,
  AuthenticateRequestAsync,
  DEFAULT_AUTHORIZATION_HEADER_NAME,
  HandleResponseAsync,
  HttpRequest,
  ISecurityHandler,
  RequestParameters,
} from '../interfaces';
import { RefreshHelper } from './refresh';

const debug = createDebug('superface:http:security:o-auth-handler');

export class OAuthHandler implements ISecurityHandler {
  private readonly selectedFlow: OAuthFlow;
  // TODO: think about better refresh handling - must be sparated from actual flow helper
  private readonly refreshHelper: RefreshHelper | undefined;

  constructor(
    readonly configuration: OAuthSecurityScheme & OAuthSecurityValues,
    private readonly fetchInstance: FetchInstance & AuthCache
  ) {
    debug('Initialized OAuthHandler');

    // Here we would have helper for each o auth flow and possible refresh token helper
    if (configuration.flows.length === 0) {
      throw new Error('Flows cant be empty');
    }

    // TODO: select the right (most secure available?) flow
    this.selectedFlow = configuration.flows[0];

    if (this.selectedFlow.refreshUrl) {
      // We will use refreshing
      this.refreshHelper = new RefreshHelper(this.selectedFlow, configuration);
    } else {
      this.refreshHelper = undefined;
    }

    // TODO: create instance of helper for selected flow.
  }

  authenticate: AuthenticateRequestAsync = async (
    parameters: RequestParameters
  ) => {
    if (
      this.refreshHelper &&
      this.refreshHelper.shouldRefresh(this.fetchInstance)
    ) {
      return await this.refreshHelper.refresh(parameters, this.fetchInstance);
    }
    // TODO: use selected flow helper (and actualy write some flow helpers)
    // Now we just get access token from cache and use it
    let authenticateParameters = parameters;
    if (this.fetchInstance.oauth?.authotizationCode?.accessToken) {
      debug('Using cached credentials');
      authenticateParameters = {
        ...parameters,
        headers: {
          ...parameters.headers,
          //TODO: prepare header according to token type
          [DEFAULT_AUTHORIZATION_HEADER_NAME]: `Bearer ${this.fetchInstance.oauth?.authotizationCode?.accessToken}`,
        },
      };
    }

    return authenticateParameters;
  };

  handleResponse: HandleResponseAsync = async (
    response: HttpResponse,
    resourceRequestParameters: RequestParameters
  ): Promise<HttpRequest | undefined> => {
    if (
      this.refreshHelper !== undefined &&
      this.refreshHelper.shouldRefresh(this.fetchInstance, response)
    ) {
      const prepared = await prepareRequestFilter({
        parameters: resourceRequestParameters,
      });

      if (
        prepared.request === undefined ||
        !isCompleteHttpRequest(prepared.request)
      ) {
        throw new Error('Request not defined');
      }

      return prepared.request;
    }

    return undefined;
  };
}
