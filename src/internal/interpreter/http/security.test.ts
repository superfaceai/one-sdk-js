import { ApiKeyPlacement, HttpScheme, SecurityType } from '@superfaceai/ast';

import { SDKExecutionError } from '../../errors';
import { ApiKeyHandler } from '.';
import { HttpHandler, RequestContext, SecurityConfiguration } from './security';

describe('httpSecurity', () => {
  describe('HttpHandler', () => {
    let httpHandler: HttpHandler;
    let context: RequestContext;
    let configuration: SecurityConfiguration & { type: SecurityType.HTTP };
    describe('basic', () => {
      it('sets header to correct value', () => {
        httpHandler = new HttpHandler();
        context = {
          headers: {},
          pathParameters: {},
          queryAuth: {},
          requestBody: undefined,
        };
        configuration = {
          id: 'test',
          type: SecurityType.HTTP,
          scheme: HttpScheme.BASIC,
          username: 'user',
          password: 'secret',
        };
        httpHandler.prepare(context, configuration);

        expect(context.headers).toEqual({
          Authorization: 'Basic dXNlcjpzZWNyZXQ=',
        });
      });
    });

    describe('bearer', () => {
      it('sets header to correct value', () => {
        httpHandler = new HttpHandler();
        context = {
          headers: {},
          pathParameters: {},
          queryAuth: {},
          requestBody: undefined,
        };
        configuration = {
          id: 'test',
          type: SecurityType.HTTP,
          scheme: HttpScheme.BEARER,
          token: 'secret',
        };
        httpHandler.prepare(context, configuration);

        expect(context.headers).toEqual({ Authorization: 'Bearer secret' });
      });
    });
  });
  describe('ApiKeyHandler', () => {
    let apiKeyHandler: ApiKeyHandler;
    let context: RequestContext;
    let configuration: SecurityConfiguration & { type: SecurityType.APIKEY };
    describe('in header', () => {
      beforeEach(() => {
        apiKeyHandler = new ApiKeyHandler();
        context = {
          headers: {},
          pathParameters: {},
          queryAuth: {},
          requestBody: undefined,
        };
        configuration = {
          id: 'test',
          type: SecurityType.APIKEY,
          in: ApiKeyPlacement.HEADER,
          name: undefined,
          apikey: 'secret',
        };
      });
      it('sets header to correct value', () => {
        apiKeyHandler.prepare(context, configuration);

        expect(context.headers).toEqual({ Authorization: 'secret' });
      });

      it('sets custom header to correct value', () => {
        configuration.name = 'test';
        apiKeyHandler.prepare(context, configuration);

        expect(context.headers).toEqual({ test: 'secret' });
      });
    });

    describe('in path', () => {
      beforeEach(() => {
        apiKeyHandler = new ApiKeyHandler();
        context = {
          headers: {},
          pathParameters: {},
          queryAuth: {},
          requestBody: undefined,
        };
        configuration = {
          id: 'test',
          type: SecurityType.APIKEY,
          in: ApiKeyPlacement.PATH,
          name: undefined,
          apikey: 'secret',
        };
      });
      it('sets pathParameters to correct value', () => {
        apiKeyHandler.prepare(context, configuration);

        expect(context.pathParameters).toEqual({ Authorization: 'secret' });
      });

      it('sets pathParameters header to correct value', () => {
        configuration.name = 'test';
        apiKeyHandler.prepare(context, configuration);

        expect(context.pathParameters).toEqual({ test: 'secret' });
      });
    });

    describe('in query', () => {
      beforeEach(() => {
        apiKeyHandler = new ApiKeyHandler();
        context = {
          headers: {},
          pathParameters: {},
          queryAuth: {},
          requestBody: undefined,
        };
        configuration = {
          id: 'test',
          type: SecurityType.APIKEY,
          in: ApiKeyPlacement.QUERY,
          name: undefined,
          apikey: 'secret',
        };
      });
      it('sets query to correct value', () => {
        apiKeyHandler.prepare(context, configuration);

        expect(context.queryAuth).toEqual({ Authorization: 'secret' });
      });

      it('sets query header to correct value', () => {
        configuration.name = 'test';
        apiKeyHandler.prepare(context, configuration);

        expect(context.queryAuth).toEqual({ test: 'secret' });
      });
    });
    describe('in body', () => {
      beforeEach(() => {
        apiKeyHandler = new ApiKeyHandler();
        context = {
          headers: {},
          pathParameters: {},
          queryAuth: {},
          requestBody: undefined,
        };
        configuration = {
          id: 'test',
          type: SecurityType.APIKEY,
          in: ApiKeyPlacement.BODY,
          name: undefined,
          apikey: 'secret',
        };
      });

      it('sets name with Primitive type', () => {
        configuration.name = 'token';
        apiKeyHandler.prepare(context, configuration);

        expect(context.requestBody).toEqual({ token: 'secret' });
      });

      it('creates new nested sctructure', () => {
        configuration.name = '/a/b/c';
        apiKeyHandler.prepare(context, configuration);

        expect(context.requestBody).toEqual({
          a: {
            b: {
              c: 'secret',
            },
          },
        });
      });

      it('keep content of existing objects', () => {
        context.requestBody = { d: 'existing' };
        configuration.name = '/a/b/c';
        apiKeyHandler.prepare(context, configuration);

        expect(context.requestBody).toEqual({
          a: {
            b: {
              c: 'secret',
            },
          },
          d: 'existing',
        });
      });

      it('throws exception if request body is array', () => {
        context.requestBody = [];
        expect(() =>
          apiKeyHandler.prepare(context, configuration)
        ).toThrowError(
          new SDKExecutionError(
            'ApiKey in body can be used only on object.',
            ['Actual body is Array'],
            []
          )
        );
      });

      it('throws exception if in body path is array', () => {
        context.requestBody = { a: { b: [] } };
        configuration.name = '/a/b/c';
        expect(() =>
          apiKeyHandler.prepare(context, configuration)
        ).toThrowError(
          new SDKExecutionError(
            'ApiKey in body can be used only on object.',
            ['Actual value at /a/b is Array'],
            []
          )
        );
      });

      it('throws exception if Primitive value is in body path', () => {
        context.requestBody = { a: { b: { c: 'xxx' } } };
        configuration.name = '/a/b/c';
        expect(() =>
          apiKeyHandler.prepare(context, configuration)
        ).toThrowError(
          new SDKExecutionError(
            'ApiKey in body can be used only on object.',
            ['Actual value at /a/b/c is string'],
            []
          )
        );
      });
    });
  });
});
