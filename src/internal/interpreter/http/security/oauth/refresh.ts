import {
  OAuthClientAuthenticationMethod,
  OAuthFlow,
  OAuthSecurityValues,
  OAuthTokenType,
} from '@superfaceai/ast';
import createDebug from 'debug';

import { UnexpectedError } from '../../../../errors';
import { Variables } from '../../../variables';
import { createUrl, HttpResponse } from '../../http';
import { FetchInstance, URLENCODED_CONTENT } from '../../interfaces';
import {
  fetchFilter,
  pipe,
  prepareRequestFilter,
  withRequest,
} from '../../pipe';
import {
  AuthCache,
  DEFAULT_AUTHORIZATION_HEADER_NAME,
  RequestParameters,
} from '../interfaces';

const debug = createDebug('superface:http:security:refresh');

export class RefreshHelper {
  private readonly refreshStatusCode: number;
  private readonly clientAuthenticationMethod: OAuthClientAuthenticationMethod;
  constructor(
    private readonly flow: OAuthFlow,
    private configuration: OAuthSecurityValues
  ) {
    debug('Initialized RefreshHelper');

    if (!this.flow.refreshUrl) {
      throw new Error('Refresh url must be difined');
    }
    this.refreshStatusCode = flow.refreshStatusCode ?? 401;
    //Basic must be supported according to rfc
    this.clientAuthenticationMethod =
      flow.clientAuthenticationMethod ??
      OAuthClientAuthenticationMethod.CLIENT_SECRET_BASIC;
  }

  shouldRefresh(cache: AuthCache, response?: HttpResponse): boolean {
    //If we dont have response we check cache
    if (
      !response &&
      (!cache.oauth?.authotizationCode?.accessToken ||
        this.isAccessTokenExpired(cache.oauth.authotizationCode.expiresAt))
    ) {
      return true;
    }

    if (response && response.statusCode === this.refreshStatusCode) {
      return true;
    }

    return false;
  }

  async refresh(
    parameters: RequestParameters,
    cache: AuthCache,
    fetchInstance: FetchInstance
  ): Promise<RequestParameters> {
    debug('RefreshHelper started refreshing');

    if (!this.flow.refreshUrl) {
      throw new Error('Refresh url must be difined');
    }

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

    const refreshRequest: RequestParameters = {
      method: 'post',
      headers,
      body,
      //TODO: Custom content type
      contentType: URLENCODED_CONTENT,
      baseUrl: createUrl(this.flow.refreshUrl, {
        baseUrl: parameters.baseUrl,
      }),
      url: '',
    };

    const refreshResponse = (
      await pipe({
        initial: { parameters: refreshRequest },
        filters: [
          prepareRequestFilter,
          withRequest(fetchFilter(fetchInstance)),
        ],
      })
    ).response;

    if (!refreshResponse) {
      throw new Error('Response is undefined');
    }

    if (
      //200 is defined by rfc
      refreshResponse.statusCode === 200
    ) {
      //Extract access token info from body
      const accessTokenResponse = refreshResponse.body as {
        access_token: string;
        token_type: string;
        refresh_token?: string;
        expires_in?: number;
        scope: string;
      };

      if (!accessTokenResponse.access_token) {
        //TODO: move to error helpers
        throw new UnexpectedError(
          'Missing property "access_token" in response body',
          accessTokenResponse
        );
      }

      if (!accessTokenResponse.token_type) {
        throw new UnexpectedError(
          'Missing property "token_type" in response body',
          accessTokenResponse
        );
      }

      if (
        accessTokenResponse.token_type !== OAuthTokenType.BEARER //&&
        // accessTokenResponse.token_type !== OAuthTokenType.MAC
      ) {
        throw new UnexpectedError(
          'Property "token_type" has invalid value',
          accessTokenResponse.token_type
        );
      }

      if (!cache.oauth) {
        cache.oauth = {};
      }
      cache.oauth.authotizationCode = {
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

      return {
        ...parameters,
        headers: {
          ...parameters.headers,
          // TODO: prepare header according to token type
          [DEFAULT_AUTHORIZATION_HEADER_NAME]: `Bearer ${accessTokenResponse.access_token}`,
        },
      };
    }

    //TODO: handle this
    throw new Error('Unable to get refresh token - unknown response status');
  }

  private isAccessTokenExpired(expiresAt?: number): boolean {
    if (!expiresAt) {
      return false;
    }
    const currentTime = Math.floor(Date.now() / 1000);

    return currentTime >= expiresAt;
  }
}
