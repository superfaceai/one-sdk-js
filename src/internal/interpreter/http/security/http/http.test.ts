import { HttpScheme, SecurityType } from '@superfaceai/ast';

import { RequestContext, SecurityConfiguration } from '../../security';
import { HttpHandler } from './http';

describe('HttpHandler', () => {
  let httpHandler: HttpHandler;
  let context: RequestContext;
  let configuration: SecurityConfiguration & { type: SecurityType.HTTP };
  describe('prepare', () => {
    it('sets header to correct value', () => {
      context = {
        url: '',
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
      httpHandler = new HttpHandler(configuration);
      httpHandler.prepare(context);

      expect(context.headers).toEqual({
        Authorization: 'Basic dXNlcjpzZWNyZXQ=',
      });
    });
  });

  describe('bearer', () => {
    it('sets header to correct value', () => {
      context = {
        url: '',
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
      httpHandler = new HttpHandler(configuration);
      httpHandler.prepare(context);

      expect(context.headers).toEqual({ Authorization: 'Bearer secret' });
    });
  });
});
