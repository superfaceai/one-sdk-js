import { ApiKeyPlacement, SecurityType } from '@superfaceai/ast';

import { SDKExecutionError } from '../../errors';
import {
  applyApiKeyAuth,
  RequestContext,
  SecurityConfiguration,
} from './security';

describe('http · security', () => {
  describe('#applyApiKeyAuth', () => {
    describe('in body', () => {
      let context: RequestContext;
      let configuration: SecurityConfiguration & { type: SecurityType.APIKEY };

      beforeEach(() => {
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
        applyApiKeyAuth(context, configuration);

        expect(context.requestBody).toEqual({ token: 'secret' });
      });

      it('creates new nested sctructure', () => {
        configuration.name = '/a/b/c';
        applyApiKeyAuth(context, configuration);

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
        applyApiKeyAuth(context, configuration);

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
        expect(() => applyApiKeyAuth(context, configuration)).toThrowError(
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
        expect(() => applyApiKeyAuth(context, configuration)).toThrowError(
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
        expect(() => applyApiKeyAuth(context, configuration)).toThrowError(
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
