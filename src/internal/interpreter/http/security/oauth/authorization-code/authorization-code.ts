import { HttpRequest, RequestParameters } from '../..';
import { AuthCache } from '../../../../../../client';
import { createUrl, HttpResponse } from '../../../http';
import { URLENCODED_CONTENT } from '../../../interfaces';
import { DEFAULT_AUTHORIZATION_HEADER_NAME } from '../../interfaces';
import { encodeBody, prepareRequest } from '../../utils';

export enum AuthorizationCodeState {
  OK,
  REFRESHING,
  //TODO: more states according to auth. process
}

//TODO: this shoul by in ast super.json/provider.json
export type TempAuthorizationCodeConfiguration = {
  //This could be in super.json or in provider.json
  clientId: string;
  clientSecret: string;
  //Initial tokens - this will be in super.json - problem: how we will inform user/pass him new values?
  refreshToken: string;
  accessToken?: string;
  //This will be in provider.json (stolen from postman and openAPI: https://swagger.io/specification/#oauth-flows-object )
  // authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
};

/**
 * For now this only deals with refreshing the access token
 */
export class AuthorizationCodeHandler {
  //implements ISecurityHandler {
  //This would hold the state/progress in the flow
  private state: AuthorizationCodeState;

  //This will be "configuration" property when we add oauth to ast package provider.json and super.json definitions
  //TODO: Pass o auth values in configuration (content of super.json and provider.json security)
  constructor(readonly configuration: TempAuthorizationCodeConfiguration) {
    console.log('init with ', configuration);
    //For now we start at OK
    this.state = AuthorizationCodeState.OK;
  }
  //TODO: here we would initialize the flow (get the first access token)
  //TODO: we will probably need a way to change url of of the request (like point to token enpoint instead of api resurce endpoint)
  prepare(parameters: RequestParameters, cache: AuthCache): HttpRequest {
    //Now we will just load access token from cache and add it as Bearer token. Or if we have it in we can check if token is expired.
    if (
      cache.oauth?.authotizationCode?.accessToken &&
      !this.isAccessTokenExpired(cache.oauth.authotizationCode.expiresAt)
    ) {
      return prepareRequest({
        ...parameters,
        headers: {
          ...parameters.headers,
          [DEFAULT_AUTHORIZATION_HEADER_NAME]: `Bearer ${
            cache.oauth?.authotizationCode?.accessToken ||
            this.configuration.accessToken
          }`,
        },
      });
    } else {
      //We should set up for refreshing of the token
      return this.startRefreshing(parameters);
    }
  }

  handle(
    response: HttpResponse,
    resourceRequestParameters: RequestParameters,
    cache: AuthCache
  ): HttpRequest | undefined {
    console.log('handle response', response);
    //Decide if we need to refresh token
    //TODO: can this be custom status code or even custom logic??
    if (
      this.state === AuthorizationCodeState.OK &&
      response.statusCode === 401
    ) {
      //Prepare refreshing token
      return this.startRefreshing(resourceRequestParameters);
    }
    //Handle refresh
    //TODO: can this be also custom?
    if (
      this.state === AuthorizationCodeState.REFRESHING &&
      response.statusCode === 200
    ) {
      //TODO: do this safely
      //Extract access token from body
      const accessToken = (response.body as Record<string, unknown>)
        .access_token;
      const expiresIn = (response.body as Record<string, unknown>).expires_in;
      const expiresAt = Math.floor(Date.now() / 1000) + Number(expiresIn);
      const scopes = (response.body as Record<string, unknown>).scope;
      const tokenType = (response.body as Record<string, unknown>).token_type;

      console.log(
        'extracted at',
        accessToken,
        ' eAt',
        expiresAt,
        ' scopes ',
        scopes,
        ' tt',
        tokenType
      );
      //Cache new token
      if (!cache.oauth) {
        cache.oauth = {};
      }
      cache.oauth.authotizationCode = {
        accessToken: accessToken as string,
        expiresAt,
        scopes: scopes as string[],
        tokenType: tokenType as string,
      };
      this.state = AuthorizationCodeState.OK;

      return prepareRequest({
        ...resourceRequestParameters,
        headers: {
          ...resourceRequestParameters.headers,
          [DEFAULT_AUTHORIZATION_HEADER_NAME]: `Bearer ${cache.oauth?.authotizationCode?.accessToken}`,
        },
      });
    }
    //Do nothing - this will lead to returning original response
    return;
  }

  private startRefreshing(parameters: RequestParameters): HttpRequest {
    this.state = AuthorizationCodeState.REFRESHING;

    //TODO: custom content type, body and headers??
    const bodyAndHeaders = encodeBody(
      URLENCODED_CONTENT,
      {
        grant_type: 'refresh_token',
        refresh_token: this.configuration.refreshToken,
        client_id: this.configuration.clientId,
        client_secret: this.configuration.clientSecret,
      },
      {}
    );

    const request: HttpRequest = {
      headers: bodyAndHeaders.headers,
      //TODO: custom method??
      method: 'post',
      body: bodyAndHeaders.body,
      url: createUrl(this.configuration.tokenUrl, {
        baseUrl: parameters.baseUrl,
      }),
    };
    return request;
  }

  private isAccessTokenExpired(expiresAt: number): boolean {
    const currentTime = Math.floor(Date.now() / 1000);
    return currentTime >= expiresAt;
  }
}
