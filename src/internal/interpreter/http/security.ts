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

import { AuthCache } from '../../..';
import { UnexpectedError } from '../../errors';
import { apiKeyInBodyError } from '../../errors.helpers';
import { NonPrimitive, Variables } from '../variables';
import { HttpResponse } from '.';
import { DigestHelper } from './digest';

const DEFAULT_AUTHORIZATION_HEADER_NAME = 'Authorization';

/**
 * Represents class that is able to prepare (set headers, path etc.) and handle (challange responses for eg. digest) authentication
 */
export interface SecurityHandler {
  /**
   * Prepares request context for making the api call.
   * @param context context for making request this can be changed during preparation (eg. authorize header will be added)
   * @param configuration security configuration from super.json and provider.json
   * @param cache this cache can hold credentials for some of the authentication methods eg. digest
   */
  prepare(
    context: RequestContext,
    configuration: SecurityConfiguration & { type: SecurityType },
    cache: AuthCache
  ): void;
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

export class DigestHandler implements SecurityHandler {
  private helper?: DigestHelper;

  prepare(
    context: RequestContext,
    _configuration: SecurityConfiguration & { type: SecurityType },
    cache: AuthCache
  ): void {
    //FIX: Should be passed in super.json configuration
    const user = process.env.CLOCKPLUS_USERNAME;
    if (!user) {
      throw new UnexpectedError('Missing user');
    }
    const password = process.env.CLOCKPLUS_PASSWORD;
    if (!password) {
      throw new UnexpectedError('Missing password');
    }
    //TODO: other options
    this.helper = new DigestHelper(user, password);

    if (cache?.cache?.digest) {
      context.headers[DEFAULT_AUTHORIZATION_HEADER_NAME] = cache.cache.digest;
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
      context.headers[DEFAULT_AUTHORIZATION_HEADER_NAME] = credentials;
      if (!cache.cache) {
        cache.cache = {};
      }
      cache.cache.digest = credentials;

      return true;
    }

    return false;
  }
}
export class ApiKeyHandler implements SecurityHandler {
  prepare(
    context: RequestContext,
    configuration: SecurityConfiguration & { type: SecurityType.APIKEY }
  ): void {
    const name = configuration.name || DEFAULT_AUTHORIZATION_HEADER_NAME;

    switch (configuration.in) {
      case ApiKeyPlacement.HEADER:
        context.headers[name] = configuration.apikey;
        break;

      case ApiKeyPlacement.BODY:
        context.requestBody = this.applyApiKeyAuthInBody(
          context.requestBody ?? {},
          name.startsWith('/') ? name.slice(1).split('/') : [name],
          configuration.apikey
        );
        break;

      case ApiKeyPlacement.PATH:
        context.pathParameters[name] = configuration.apikey;
        break;

      case ApiKeyPlacement.QUERY:
        context.queryAuth[name] = configuration.apikey;

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

export class HttpHandler implements SecurityHandler {
  prepare(
    context: RequestContext,
    configuration: SecurityConfiguration & { type: SecurityType.HTTP }
  ): void {
    switch (configuration.scheme) {
      case HttpScheme.BASIC:
        this.applyBasicAuth(context, configuration);
        break;
      case HttpScheme.BEARER:
        this.applyBearerToken(context, configuration);
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
