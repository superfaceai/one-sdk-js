import {
  OAuthClientAuthenticationMethod,
  OAuthFlow,
  OAuthSecurityValues,
  OAuthTokenType,
} from '@superfaceai/ast';

import { UnexpectedError } from '../../../../errors';
import { Variables } from '../../../variables';
import { createUrl, HttpResponse } from '../..';
import { URLENCODED_CONTENT } from '../../interfaces';
import { AuthCache, AuthCacheAuthorizationCode } from '..';
import {
  DEFAULT_AUTHORIZATION_HEADER_NAME,
  RequestParameters,
} from '../interfaces';

export enum RefreshState {
  OK,
  REFRESHING,
  //TODO: more states according to auth. process
}

export class RefreshHelper {
  private state: RefreshState;

  //TODO: naming
  private readonly refreshStatusCode: number;
  private readonly clientAuthenticationMethod: OAuthClientAuthenticationMethod;

  //This will be "configuration" property when we add oauth to ast package provider.json and super.json definitions
  //TODO: Pass o auth values in configuration (content of super.json and provider.json security)
  constructor(
    private readonly flow: OAuthFlow,
    private configuration: OAuthSecurityValues
  ) {
    //For now we start at OK
    this.state = RefreshState.OK;

    if (!this.flow.refreshUrl) {
      throw new Error('Refresh url must be difined');
    }
    this.refreshStatusCode = flow.refreshStatusCode ?? 401;
    //Basic must be supported according to rfc
    this.clientAuthenticationMethod =
      flow.clientAuthenticationMethod ??
      OAuthClientAuthenticationMethod.CLIENT_SECRET_BASIC;
  }

  shouldStartRefreshing(cache: AuthCache, response?: HttpResponse): boolean {
    //If we dont have response we check cache
    if (
      !response &&
      (!cache.oauth?.authotizationCode?.accessToken ||
        this.isAccessTokenExpired(cache.oauth.authotizationCode.expiresAt))
    ) {
      return true;
    }

    if (
      response &&
      this.state === RefreshState.OK &&
      response.statusCode === this.refreshStatusCode
    ) {
      return true;
    }

    return false;
  }

  shouldStopRefreshing(response?: HttpResponse): boolean {
    if (
      response &&
      response.statusCode === 200 &&
      this.state === RefreshState.REFRESHING
    ) {
      return true;
    }
    
return false;
  }

  stopRefreshing(
    response: HttpResponse
  ): AuthCacheAuthorizationCode | undefined {
    //Handle refresh
    if (
      this.state === RefreshState.REFRESHING &&
      //200 is defined by rfc
      response.statusCode === 200
    ) {
      console.log('response body', response.body);
      //Extract access token info from body
      const accessTokenResponse = response.body as {
        access_token: string;
        token_type: string;
        refresh_token?: string;
        expires_in?: number;
        scope: string;
      };

      if (!accessTokenResponse.access_token) {
        //TODO: move to error helpers
        throw new UnexpectedError(
          `Missing property "access_token" in response body`,
          accessTokenResponse
        );
      }

      if (!accessTokenResponse.token_type) {
        throw new UnexpectedError(
          `Missing property "token_type" in response body`,
          accessTokenResponse
        );
      }

      if (
        accessTokenResponse.token_type !== OAuthTokenType.BEARER //&&
        // accessTokenResponse.token_type !== OAuthTokenType.MAC
      ) {
        throw new UnexpectedError(
          `Property "token_type" has invalid value`,
          accessTokenResponse.token_type
        );
      }
      this.state = RefreshState.OK;

      return {
        accessToken: accessTokenResponse.access_token,
        refreshToken: accessTokenResponse.refresh_token,
        expiresAt: accessTokenResponse.expires_in
          ? Math.floor(Date.now() / 1000) + accessTokenResponse.expires_in
          : undefined,
        scopes: accessTokenResponse.scope
          ? //TODO: custom separator
            accessTokenResponse.scope.split(' ')
          : [],
        tokenType: accessTokenResponse.token_type,
      };
    }
    
return undefined;
  }

  startRefreshing(parameters: RequestParameters): RequestParameters {
    console.log('refereshing');
    this.state = RefreshState.REFRESHING;

    const body: Variables = {
      //grant_type and refresh_token is defined in rfc.
      grant_type: 'refresh_token',
      refresh_token: this.configuration.refreshToken,
      //We are omiting scope to ensure that user is not extending his access
    };
    const headers: Record<string, string> = {};

    if (
      this.clientAuthenticationMethod ===
      OAuthClientAuthenticationMethod.CLIENT_SECRET_BASIC
    ) {
      headers[DEFAULT_AUTHORIZATION_HEADER_NAME] =
        'Basic ' +
        Buffer.from(
          `${this.configuration.clientId}:${this.configuration.clientSecret}`
        ).toString('base64');
    } else {
      body.client_id = this.configuration.clientId;
      body.client_secret = this.configuration.clientSecret;
    }

    return {
      method: 'post',
      headers,
      body,
      //TODO: Custom content type
      contentType: URLENCODED_CONTENT,
      baseUrl: createUrl(this.flow.refreshUrl!, {
        baseUrl: parameters.baseUrl,
      }),
      url: '',
    };
  }

  private isAccessTokenExpired(expiresAt?: number): boolean {
    if (!expiresAt) {
      return false;
    }
    const currentTime = Math.floor(Date.now() / 1000);
    
return currentTime >= expiresAt;
  }
}
