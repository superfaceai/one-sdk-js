import {
  OAuthFlow,
  OAuthSecurityScheme,
  OAuthSecurityValues,
} from '@superfaceai/ast';

import { fetchRequest } from '../..';
import { HttpResponse } from '../../http';
import { FetchInstance } from '../../interfaces';
import { HandleResponseAsync, HttpRequest } from '..';
import {
  AuthCache,
  AuthenticateRequestAsync,
  DEFAULT_AUTHORIZATION_HEADER_NAME,
  ISecurityHandler,
  RequestParameters,
} from '../interfaces';
import { prepareRequest } from '../utils';
import { RefreshHelper } from './refresh';

export class OAuthHandler implements ISecurityHandler {
  private readonly selectedFlow: OAuthFlow;
  //TODO: think about better refresh handling - must be sparated from actual flow helper
  private readonly refreshHelper: RefreshHelper | undefined;

  constructor(
    readonly configuration: OAuthSecurityScheme & OAuthSecurityValues
  ) {
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
      return prepareRequest(
        await this.refreshHelper.refresh(
          parameters,
          fetchInstance,
          fetchInstance,
          fetchRequest
        )
      );
    }
    //TODO: use selected flow helper (and actualy write some flow helpers)
    //Now we just get access token from cache and use it
    if (fetchInstance.oauth?.authotizationCode?.accessToken) {
      return prepareRequest({
        ...parameters,
        headers: {
          ...parameters.headers,
          //TODO: prepare header according to token type
          [DEFAULT_AUTHORIZATION_HEADER_NAME]: `Bearer ${fetchInstance.oauth?.authotizationCode?.accessToken}`,
        },
      });
    }

    return prepareRequest(parameters);
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
      return prepareRequest(
        await this.refreshHelper.refresh(
          resourceRequestParameters,
          fetchInstance,
          fetchInstance,
          fetchRequest
        )
      );
    }

    return undefined;
  };
}
