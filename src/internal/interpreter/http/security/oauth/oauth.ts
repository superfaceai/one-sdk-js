import {
  OAuthFlow,
  OAuthSecurityScheme,
  OAuthSecurityValues,
} from '@superfaceai/ast';
import createDebug from 'debug';

import { HttpResponse } from '../../http';
import { FetchInstance } from '../../interfaces';
import { headersFilter, pipe, prepareRequestFilter } from '../../pipe';
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
  //TODO: think about better refresh handling - must be sparated from actual flow helper
  private readonly refreshHelper: RefreshHelper | undefined;

  constructor(
    readonly configuration: OAuthSecurityScheme & OAuthSecurityValues
  ) {
    debug('Initialized OAuthHandler');

    //Here we would have helper for each o auth flow and possible refresh token helper
    if (configuration.flows.length === 0) {
      throw new Error('Flows cant be empty');
    }
    //TODO: select the right (most secure available?) flow
    this.selectedFlow = configuration.flows[0];

    if (this.selectedFlow.refreshUrl) {
      //We will use refreshing
      this.refreshHelper = new RefreshHelper(this.selectedFlow, configuration);
    } else {
      this.refreshHelper = undefined;
    }

    //TODO: create instance of helper for selected flow.
  }

  authenticate: AuthenticateRequestAsync = async (
    parameters: RequestParameters,
    fetchInstance: FetchInstance & AuthCache
  ) => {
    if (this.refreshHelper && this.refreshHelper.shouldRefresh(fetchInstance)) {
      const refreshedParameters = await this.refreshHelper.refresh(
        parameters,
        fetchInstance,
        fetchInstance
      );
      const prepared = await pipe({
        parameters: refreshedParameters,
        fetchInstance,
        filters: [headersFilter, prepareRequestFilter],
      });

      if (!prepared.request) {
        throw new Error('Request not defined');
      }

      return prepared.request;
    }
    //TODO: use selected flow helper (and actualy write some flow helpers)
    //Now we just get access token from cache and use it
    let authenticateParameters = parameters;
    if (fetchInstance.oauth?.authotizationCode?.accessToken) {
      debug('Using cached credentials');
      authenticateParameters = {
        ...parameters,
        headers: {
          ...parameters.headers,
          //TODO: prepare header according to token type
          [DEFAULT_AUTHORIZATION_HEADER_NAME]: `Bearer ${fetchInstance.oauth?.authotizationCode?.accessToken}`,
        },
      };
    }

    const prepared = await pipe({
      parameters: authenticateParameters,
      fetchInstance,
      filters: [headersFilter, prepareRequestFilter],
    });

    if (!prepared.request) {
      throw new Error('Request not defined');
    }

    return prepared.request;
  };

  handleResponse: HandleResponseAsync = async (
    response: HttpResponse,
    resourceRequestParameters: RequestParameters,
    fetchInstance: FetchInstance & AuthCache
  ): Promise<HttpRequest | undefined> => {
    if (
      this.refreshHelper &&
      this.refreshHelper.shouldRefresh(fetchInstance, response)
    ) {
      const prepared = await pipe({
        parameters: resourceRequestParameters,
        fetchInstance,
        filters: [headersFilter, prepareRequestFilter],
      });

      if (!prepared.request) {
        throw new Error('Request not defined');
      }

      return prepared.request;
    }

    return undefined;
  };
}
