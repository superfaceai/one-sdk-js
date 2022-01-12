import {
  ApiKeyPlacement,
  ApiKeySecurityScheme,
  ApiKeySecurityValues,
  BasicAuthSecurityScheme,
  BasicAuthSecurityValues,
  BearerTokenSecurityScheme,
  BearerTokenSecurityValues,
  DigestSecurityScheme,
  DigestSecurityValues,
  HttpScheme,
  SecurityType,
} from '@superfaceai/ast';

import { AuthCache } from '../../../client';
import { apiKeyInBodyError } from '../../errors.helpers';
import { NonPrimitive, Variables } from '../variables';
import { DigestHelper } from './digest';
import { HttpResponse } from './http';

const DEFAULT_AUTHORIZATION_HEADER_NAME = 'Authorization';

/**
 * Represents class that is able to prepare (set headers, path etc.) and handle (challange responses for eg. digest) authentication
 */
export interface ISecurityHandler {
  /**
   * Hold SecurityConfiguration context for handling more complex authentizations
   */
  readonly configuration: SecurityConfiguration;
  /**
   * Prepares request context for making the api call.
   * @param context context for making request this can be changed during preparation (eg. authorize header will be added)
   * @param cache this cache can hold credentials for some of the authentication methods eg. digest
   */
  prepare(context: RequestContext, cache: AuthCache): void;
  /**
   * Handles responses for more complex authentization methods (eg. digest)
   * @param response response from http call - can contain challange
   * @param url url of (possibly next) http call
   * @param method method of (possibly next) http call
   * @param context context for making (possibly next) request - this can be changed during preparation (eg. authorize header will be added)
   * @param cache this cache can hold credentials for some of the authentication methods eg. digest
   * @returns flag if we need to retry http request (with new settings applied)
   */
  handle?(
    response: HttpResponse,
    url: string,
    method: string,
    context: RequestContext,
    cache: AuthCache
  ): boolean;
}

export type SecurityConfiguration =
  | (ApiKeySecurityScheme & ApiKeySecurityValues)
  | (BasicAuthSecurityScheme & BasicAuthSecurityValues)
  | (BearerTokenSecurityScheme & BearerTokenSecurityValues)
  | (DigestSecurityScheme & DigestSecurityValues);

export type RequestContext = {
  pathParameters: NonPrimitive;
  queryAuth: Record<string, string>;
  headers: Record<string, string>;
  requestBody: Variables | undefined;
};

export class DigestHandler implements ISecurityHandler {
  private helper?: DigestHelper;

  constructor(
    readonly configuration: DigestSecurityScheme & DigestSecurityValues
  ) {}

  prepare(context: RequestContext, cache: AuthCache): void {
    //TODO: other options
    this.helper = new DigestHelper(
      this.configuration.username,
      this.configuration.password,
      {
        statusCode: this.configuration.statusCode,
        challangeHeader: this.configuration.challengeHeader,
      }
    );

    if (cache?.digest) {
      context.headers[
        this.configuration.authorizationHeader ||
          DEFAULT_AUTHORIZATION_HEADER_NAME
      ] = cache.digest;
    }
  }

  handle(
    response: HttpResponse,
    url: string,
    method: string,
    context: RequestContext,
    cache: AuthCache
  ): boolean {
    if (!this.helper) {
      throw new Error('Digest helper not initialized');
    }
    const credentials = this.helper.extractCredentials(response, url, method);
    if (credentials) {
      context.headers[
        this.configuration.authorizationHeader ||
          DEFAULT_AUTHORIZATION_HEADER_NAME
      ] = credentials;
      cache.digest = credentials;

      return true;
    }

    return false;
  }
}
export class ApiKeyHandler implements ISecurityHandler {
  constructor(
    readonly configuration: ApiKeySecurityScheme & ApiKeySecurityValues
  ) {}

  prepare(context: RequestContext): void {
    const name = this.configuration.name || DEFAULT_AUTHORIZATION_HEADER_NAME;

    switch (this.configuration.in) {
      case ApiKeyPlacement.HEADER:
        context.headers[name] = this.configuration.apikey;
        break;

      case ApiKeyPlacement.BODY:
        context.requestBody = this.applyApiKeyAuthInBody(
          context.requestBody ?? {},
          name.startsWith('/') ? name.slice(1).split('/') : [name],
          this.configuration.apikey
        );
        break;

      case ApiKeyPlacement.PATH:
        context.pathParameters[name] = this.configuration.apikey;
        break;

      case ApiKeyPlacement.QUERY:
        context.queryAuth[name] = this.configuration.apikey;

        break;
    }
  }

  private applyApiKeyAuthInBody(
    requestBody: Variables,
    referenceTokens: string[],
    apikey: string,
    visitedReferenceTokens: string[] = []
  ): Variables {
    if (typeof requestBody !== 'object' || Array.isArray(requestBody)) {
      const valueLocation = visitedReferenceTokens.length
        ? `value at /${visitedReferenceTokens.join('/')}`
        : 'body';
      const bodyType = Array.isArray(requestBody)
        ? 'Array'
        : typeof requestBody;

      throw apiKeyInBodyError(valueLocation, bodyType);
    }

    const token = referenceTokens.shift();
    if (token === undefined) {
      return apikey;
    }

    const segVal = requestBody[token] ?? {};
    requestBody[token] = this.applyApiKeyAuthInBody(
      segVal,
      referenceTokens,
      apikey,
      [...visitedReferenceTokens, token]
    );

    return requestBody;
  }
}

export class HttpHandler implements ISecurityHandler {
  constructor(
    readonly configuration: SecurityConfiguration & { type: SecurityType.HTTP }
  ) {}

  prepare(context: RequestContext): void {
    switch (this.configuration.scheme) {
      case HttpScheme.BASIC:
        this.applyBasicAuth(context, this.configuration);
        break;
      case HttpScheme.BEARER:
        this.applyBearerToken(context, this.configuration);
        break;
    }
  }

  private applyBasicAuth(
    context: RequestContext,
    configuration: SecurityConfiguration & {
      type: SecurityType.HTTP;
      scheme: HttpScheme.BASIC;
    }
  ): void {
    context.headers[DEFAULT_AUTHORIZATION_HEADER_NAME] =
      'Basic ' +
      Buffer.from(
        `${configuration.username}:${configuration.password}`
      ).toString('base64');
  }

  private applyBearerToken(
    context: RequestContext,
    configuration: SecurityConfiguration & {
      type: SecurityType.HTTP;
      scheme: HttpScheme.BEARER;
    }
  ): void {
    context.headers[
      DEFAULT_AUTHORIZATION_HEADER_NAME
    ] = `Bearer ${configuration.token}`;
  }
}
