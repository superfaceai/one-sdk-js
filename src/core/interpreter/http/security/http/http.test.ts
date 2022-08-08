import { HttpScheme, SecurityType } from '@superfaceai/ast';

import { URLENCODED_CONTENT } from '../../interfaces';
import type { RequestParameters, SecurityConfiguration } from '../../security';
import { HttpHandler } from './http';

describe('HttpHandler', () => {
  let httpHandler: HttpHandler;
  let parameters: RequestParameters;
  let configuration: SecurityConfiguration & { type: SecurityType.HTTP };

  describe('prepare', () => {
    it('sets header to correct value', async () => {
      parameters = {
        url: '/api/',
        baseUrl: 'https://test.com/',
        method: 'get',
        headers: {},
        pathParameters: {},
        queryParameters: {},
        body: undefined,
        contentType: URLENCODED_CONTENT,
      };
      configuration = {
        id: 'test',
        type: SecurityType.HTTP,
        scheme: HttpScheme.BASIC,
        username: 'user',
        password: 'secret',
      };
      httpHandler = new HttpHandler(configuration);
      expect(
        (await httpHandler.authenticate(parameters)).headers?.['Authorization']
      ).toEqual('Basic dXNlcjpzZWNyZXQ=');
    });
  });

  describe('bearer', () => {
    it('sets header to correct value', async () => {
      parameters = {
        url: '/api/',
        baseUrl: 'https://test.com/',
        method: 'get',
        headers: {},
        pathParameters: {},
        queryParameters: {},
        body: undefined,
        contentType: URLENCODED_CONTENT,
      };
      configuration = {
        id: 'test',
        type: SecurityType.HTTP,
        scheme: HttpScheme.BEARER,
        token: 'secret',
      };
      httpHandler = new HttpHandler(configuration);

      expect(
        (await httpHandler.authenticate(parameters)).headers?.['Authorization']
      ).toEqual('Bearer secret');
    });
  });
});
