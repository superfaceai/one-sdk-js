import {
  OAuthFlow,
  OAuthSecurityScheme,
  OAuthSecurityValues,
} from '@superfaceai/ast';

import { HttpResponse } from '../../http';
import { FetchInstance } from '../../interfaces';
import { HandleResponseAsync } from '..';
import {
  AuthCache,
  AuthenticateRequestAsync,
  DEFAULT_AUTHORIZATION_HEADER_NAME,
  ISecurityHandler,
  RequestParameters,
} from '../interfaces';
import { RefreshHelper } from './refresh';
import { fetchRequest } from '../..';

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
    // cache: AuthCache,
    fetchInstance: FetchInstance & AuthCache
    // fetch: (
    //   fetchInstance: FetchInstance,
    //   request: HttpRequest
    // ) => Promise<HttpResponse>
  ) => {
    if (this.refreshHelper && this.refreshHelper.shouldRefresh(fetchInstance)) {
      return await this.refreshHelper.refresh(
        parameters,
        fetchInstance,
        fetchInstance,
        fetchRequest
      );
    }
    //TODO: use selected flow helper (and actualy write some flow helpers)
    //Now we just get access token from cache and use it
    if (fetchInstance.oauth?.authotizationCode?.accessToken) {
      return {
        ...parameters,
        headers: {
          ...parameters.headers,
          //TODO: prepare header according to token type
          [DEFAULT_AUTHORIZATION_HEADER_NAME]: `Bearer ${fetchInstance.oauth?.authotizationCode?.accessToken}`,
        },
      };
    }

    return parameters;
  };

  handleResponse: HandleResponseAsync = async (
    response: HttpResponse,
    resourceRequestParameters: RequestParameters,
    fetchInstance: FetchInstance & AuthCache
    // fetch: (
    //   fetchInstance: FetchInstance,
    //   request: HttpRequest
    // ) => Promise<HttpResponse>
  ): Promise<RequestParameters | undefined> => {
    if (
      this.refreshHelper &&
      this.refreshHelper.shouldRefresh(fetchInstance, response)
    ) {
      return await this.refreshHelper.refresh(
        resourceRequestParameters,
        fetchInstance,
        fetchInstance,
        fetchRequest
      );
    }

    return undefined;
  };

  // prepare(
  //   parameters: RequestParameters,
  //   cache: AuthCache
  // ): BeforeHookAuthResult {
  //   if (this.refreshHelper && this.refreshHelper.shouldStartRefreshing(cache)) {
  //     return {
  //       kind: 'modify',
  //       newArgs: [this.refreshHelper.startRefreshing(parameters)],
  //     };
  //   }
  //   //TODO: use selected flow helper
  //   return { kind: 'continue' };
  // }

  // handle(
  //   response: HttpResponse,
  //   resourceRequestParameters: RequestParameters,
  //   cache: AuthCache
  // ): AffterHookAuthResult {
  //   if (
  //     this.refreshHelper &&
  //     this.refreshHelper.shouldStartRefreshing(cache, response)
  //   ) {
  //     return {
  //       kind: 'retry',
  //       newArgs: [
  //         this.refreshHelper.startRefreshing(resourceRequestParameters),
  //       ],
  //     };
  //   }
  //   if (
  //     this.refreshHelper &&
  //     this.refreshHelper.shouldStopRefreshing(response)
  //   ) {
  //     const newValues = this.refreshHelper.stopRefreshing(response);
  //     if (newValues) {
  //       if (!cache.oauth) {
  //         cache.oauth = {};
  //       }
  //       cache.oauth.authotizationCode = newValues;
  //       //TODO: use selected flow helper

  //       return {
  //         kind: 'retry',
  //         newArgs: [
  //           {
  //             ...resourceRequestParameters,
  //             headers: {
  //               ...resourceRequestParameters.headers,
  //               //TODO: prepare header according to token type
  //               [DEFAULT_AUTHORIZATION_HEADER_NAME]: `Bearer ${newValues.accessToken}`,
  //             },
  //           },
  //         ],
  //       };
  //     }
  //   }
  //   //TODO: use selected flow helper
  //   return { kind: 'continue' };
  // }
}
