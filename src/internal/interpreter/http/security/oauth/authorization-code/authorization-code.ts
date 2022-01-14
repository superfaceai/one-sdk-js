import { AuthCache } from "../../../../../../client";
import { HttpResponse } from "../../../http";
import { DEFAULT_AUTHORIZATION_HEADER_NAME, RequestContext } from "../../interfaces";

export enum AuthorizationCodeState {
  OK,
  REFRESHING
}

export type TempAuthorizationCodeConfiguration =
  {
    //This could be in super.json or in provider.json integration parameters
    clientId: string,
    clientSecret: string,
    //Initial tokens - this will be in super.json - problem: how we will inform user/pass him new values
    refreshToken: string,
    accessToken: string,
    //This will be in provider.json (stolen from postman and openAPI: https://swagger.io/specification/#oauth-flows-object )
    authorizationUrl: string,
    tokenUrl: string,
    scopes: string[]
  }


/**
 * For now this only deals with refreshing the access token
 */
export class AuthorizationCodeHandler { // implements ISecurityHandler {
  //This would hold the state/progress in the flow
  private state: AuthorizationCodeState

  // private readonly resource

  //This will be "configuration" property when we add oauth to ast package provider.json and super.json definitions
  //TODO: Pass o auth values in configuration (content of super.json and provider.json security)
  constructor(readonly configuration: TempAuthorizationCodeConfiguration) {
    //For now we start at OK
    this.state = AuthorizationCodeState.OK;

  }
  //TODO: here we would initialize the flow (get the first access token)
  //TODO: we will probably need a way to change url of of the request (like point to token enpoint instead of api resurce endpoint)
  prepare(context: RequestContext, cache: AuthCache): void {
    //Now we will just load access token from env and add it as Bearer token. Or if we have it in we can check if token is expired.
    if (cache.oauth?.authotizationCode && this.isAccessTokenExpired(cache.oauth.authotizationCode.expiresAt)) {
      //We should set up for refreshing of the token
      this.startRefreshing(context)
    } else {
      context.headers[
        DEFAULT_AUTHORIZATION_HEADER_NAME
      ] = `Bearer ${cache.oauth?.authotizationCode?.accessToken || this.configuration.accessToken}`;
    }
  }


  handle(
    response: HttpResponse,
    //In this contect url now points to resource endpoint 
    url: string,
    method: string,
    //Contect for the next request
    context: RequestContext,
    cache: AuthCache
  ): boolean {
    //Decide if we need to refresh token
    //TODO: can this be custom status code or even custom logic??
    if (response.statusCode === 401) {
      //Prepare refreshing token
      this.startRefreshing(context)

      return true
    }
    if (this.state === AuthorizationCodeState.REFRESHING) { }

    //Handle refresh - cache new token
    return false
  }


  private startRefreshing(context: RequestContext): void {
    context.requestBody = {
      grant_type: "refresh_token",
      refresh_token: this.configuration.refreshToken,
      client_id: this.configuration.clientId,
      client_secret: this.configuration.clientSecret
    }

    context.headers['content-type'] = 'application/x-www-form-urlencoded'
    context.method = 'post'
    context.url = this.configuration.tokenUrl

    this.state = AuthorizationCodeState.REFRESHING
  }


  private isAccessTokenExpired(expiresAt: number): boolean {
    const currentTime = Math.floor(Date.now() / 1000);
    return currentTime >= expiresAt
  }
}