import {
  OAuthClientAuthenticationMethod,
  OAuthFlow,
  OAuthSecurityValues,
  OAuthTokenType,
} from '@superfaceai/ast';
import createDebug from 'debug';

import { pipe } from '../../../../../lib/pipe/pipe';
import { UnexpectedError } from '../../../../errors';
import { Variables } from '../../../variables';
import { fetchFilter, prepareRequestFilter, withRequest } from '../../filters';
import { createUrl, HttpResponse } from '../../http';
import { FetchInstance, URLENCODED_CONTENT } from '../../interfaces';
import {
  AuthCache,
  DEFAULT_AUTHORIZATION_HEADER_NAME,
  RequestParameters,
} from '../interfaces';

const debug = createDebug('superface:http:security:refresh');

function isAccessTokenExpired(expiresAt?: number): boolean {
  if (!expiresAt) {
    return false;
  }
  const currentTime = Math.floor(Date.now() / 1000);

  return currentTime >= expiresAt;
}

export class RefreshHelper {
  private readonly refreshStatusCode: number;
  private readonly clientAuthenticationMethod: OAuthClientAuthenticationMethod;
  constructor(
    private readonly flow: OAuthFlow,
    private configuration: OAuthSecurityValues
  ) {
    debug('Initialized RefreshHelper');

    if (this.flow.refreshUrl === undefined) {
      throw new UnexpectedError('Refresh url must be defined');
    }
    this.refreshStatusCode = flow.refreshStatusCode ?? 401;
    // Basic must be supported according to rfc
    this.clientAuthenticationMethod =
      flow.clientAuthenticationMethod ??
      OAuthClientAuthenticationMethod.CLIENT_SECRET_BASIC;
  }

  shouldRefresh(cache: AuthCache, response?: HttpResponse): boolean {
    // If we dont have response we check cache
    if (
      response === undefined &&
      (cache.oauth?.authotizationCode?.accessToken === undefined ||
        isAccessTokenExpired(cache.oauth.authotizationCode.expiresAt))
    ) {
      return true;
    }

    if (
      response !== undefined &&
      response.statusCode === this.refreshStatusCode
    ) {
      return true;
    }

    return false;
  }

  async refresh(
    parameters: RequestParameters,
    fetchInstance: FetchInstance & AuthCache
  ): Promise<RequestParameters> {
    debug('RefreshHelper started refreshing');

    if (!this.flow.refreshUrl) {
      throw new UnexpectedError('Refresh url must be difined');
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
      contentType: URLENCODED_CONTENT,
      baseUrl: createUrl(this.flow.refreshUrl, {
        baseUrl: parameters.baseUrl,
      }),
      url: '',
    };

    const refreshResponse = (
      await pipe(
        { parameters: refreshRequest },
        prepareRequestFilter,
        withRequest(fetchFilter(fetchInstance))
      )
    ).response;

    if (!refreshResponse) {
      throw new Error('Response is undefined');
    }

    if (
      // 200 is defined by rfc
      refreshResponse.statusCode !== 200
    ) {
      throw new UnexpectedError(
        'Unable to get refresh token - unknown response status'
      );
    }

    // Extract access token info from body
    const accessTokenResponse = refreshResponse.body as {
      access_token: string;
      token_type: string;
      refresh_token?: string;
      expires_in?: number;
      scope: string;
    };

    if (typeof accessTokenResponse.access_token !== 'string') {
      throw new UnexpectedError(
        'Missing or invalid property "access_token" in response body',
        accessTokenResponse
      );
    }

    if (typeof accessTokenResponse.token_type !== 'string') {
      throw new UnexpectedError(
        'Missing or invalid property "token_type" in response body',
        accessTokenResponse
      );
    }

    if (accessTokenResponse.token_type !== OAuthTokenType.BEARER) {
      throw new UnexpectedError(
        'Property "token_type" has invalid value',
        accessTokenResponse.token_type
      );
    }

    if (fetchInstance.oauth === undefined) {
      fetchInstance.oauth = {};
    }
    fetchInstance.oauth.authotizationCode = {
      accessToken: accessTokenResponse.access_token,
      refreshToken: accessTokenResponse.refresh_token,
      expiresAt: accessTokenResponse.expires_in
        ? Math.floor(Date.now() / 1000) + accessTokenResponse.expires_in
        : undefined,
      scopes: accessTokenResponse.scope
        ? accessTokenResponse.scope.split(' ')
        : [],
      tokenType: accessTokenResponse.token_type,
    };

    return {
      ...parameters,
      headers: {
        ...parameters.headers,
        [DEFAULT_AUTHORIZATION_HEADER_NAME]: `Bearer ${accessTokenResponse.access_token}`,
      },
    };
  }
}
