import { HttpRequest, RequestParameters } from '../..';
import { UnexpectedError } from '../../../../..';
import { Variables } from '../../../../variables';
import { createUrl, HttpResponse } from '../../../http';
import { URLENCODED_CONTENT } from '../../../interfaces';
import { AuthCache, DEFAULT_AUTHORIZATION_HEADER_NAME } from '../../interfaces';
import { encodeBody, prepareRequest } from '../../utils';

export enum OAuthTokenType {
  BEARER = 'Bearer',
  MAC = 'mac',
}

export enum OAuthClienAuthenticationMethod {
  CLIENT_SECRET_BASIC = 'client_secret_basic',
  CLIENT_SECRET_POST = 'client_secret_post',
}
export enum AuthorizationCodeState {
  OK,
  REFRESHING,
  //TODO: more states according to auth. process
}

//TODO: this should by in ast super.json/provider.json
export type TempAuthorizationCodeConfiguration = {
  //This could be in super.json or in provider.json
  clientId: string;
  clientSecret: string;
  //Initial tokens - this will be in super.json - problem: how we will inform user/pass him new values?
  refreshToken: string;
  //User can pass these
  accessToken?: string;
  tokenType?: OAuthTokenType;
  //This will be in provider.json (stolen from postman and openAPI: https://swagger.io/specification/#oauth-flows-object )
  //TODO: when working with urls - make them absolute or use base url from provider json?
  authorizationUrl: string;
  refreshUrl?: string;
  tokenUrl: string;
  scopes: string[];

  clientAuthenticationMethod?: OAuthClienAuthenticationMethod;
  //Customized oauth properties
  statusCode?: number;
  //TODO: other customizable properties
  //header??
};

/**
 * For now this only deals with refreshing the access token
 */
export class AuthorizationCodeHandler {
  //implements ISecurityHandler {
  //This would hold the state/progress in the flow
  private state: AuthorizationCodeState;

  //TODO: naming
  private readonly statusCode: number;
  private readonly clientAuthenticationMathod: OAuthClienAuthenticationMethod;

  //This will be "configuration" property when we add oauth to ast package provider.json and super.json definitions
  //TODO: Pass o auth values in configuration (content of super.json and provider.json security)
  constructor(readonly configuration: TempAuthorizationCodeConfiguration) {
    //For now we start at OK
    this.state = AuthorizationCodeState.OK;
    this.statusCode = configuration.statusCode ?? 401;
    //Basic must be supported according to rfc
    this.clientAuthenticationMathod =
      configuration.clientAuthenticationMethod ??
      OAuthClienAuthenticationMethod.CLIENT_SECRET_BASIC;
  }
  //TODO: here we would initialize the flow (get the first access token)
  prepare(parameters: RequestParameters, cache: AuthCache): HttpRequest {
    //Now we will just load access token from cache and add it as Bearer token. Or if we have it in cache we can check if token is expired.
    if (
      cache.oauth?.authotizationCode?.accessToken &&
      !this.isAccessTokenExpired(cache.oauth.authotizationCode.expiresAt)
    ) {
      return prepareRequest({
        ...parameters,
        headers: {
          ...parameters.headers,
          //TODO: set header according to tokenType
          [DEFAULT_AUTHORIZATION_HEADER_NAME]: `Bearer ${cache.oauth?.authotizationCode?.accessToken ||
            this.configuration.accessToken
            }`,
        },
      });
    } else {
      //Set up for refreshing of the token
      return this.startRefreshing(parameters);
    }
  }

  handle(
    response: HttpResponse,
    resourceRequestParameters: RequestParameters,
    cache: AuthCache
  ): HttpRequest | undefined {
    //Decide if we need to refresh token
    if (
      this.state === AuthorizationCodeState.OK &&
      response.statusCode === this.statusCode
    ) {
      //Prepare refreshing token
      return this.startRefreshing(resourceRequestParameters);
    }
    //Handle refresh
    if (
      this.state === AuthorizationCodeState.REFRESHING &&
      //200 is defined by rfc
      response.statusCode === 200
    ) {
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

      //Cache new token
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
          ? accessTokenResponse.scope.split(' ')
          : [],
        tokenType: accessTokenResponse.token_type,
      };
      this.state = AuthorizationCodeState.OK;

      return prepareRequest({
        ...resourceRequestParameters,
        headers: {
          ...resourceRequestParameters.headers,
          //TODO: prepare header according to token type
          [DEFAULT_AUTHORIZATION_HEADER_NAME]: `Bearer ${cache.oauth?.authotizationCode?.accessToken}`,
        },
      });
    }
    //Do nothing - this will lead to returning original response
    return;
  }

  private startRefreshing(parameters: RequestParameters): HttpRequest {
    this.state = AuthorizationCodeState.REFRESHING;

    let body: Variables = {
      //grant_type and refresh_token is defined in rfc.
      grant_type: 'refresh_token',
      refresh_token: this.configuration.refreshToken,
      //We are omiting scope to ensure that user is not extending his access
    };
    let headers: Record<string, string> = {};

    if (
      this.clientAuthenticationMathod ===
      OAuthClienAuthenticationMethod.CLIENT_SECRET_BASIC
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
    //TODO: custom content type, body and headers??
    const bodyAndHeaders = encodeBody(URLENCODED_CONTENT, body, headers);

    const request: HttpRequest = {
      headers: bodyAndHeaders.headers,
      method: 'post',
      body: bodyAndHeaders.body,
      url: createUrl(this.configuration.tokenUrl, {
        baseUrl: parameters.baseUrl,
      }),
    };
    return request;
  }

  private isAccessTokenExpired(expiresAt?: number): boolean {
    if (!expiresAt) {
      return false;
    }
    const currentTime = Math.floor(Date.now() / 1000);
    return currentTime >= expiresAt;
  }
}
