import { HttpScheme, SecurityType } from '@superfaceai/ast';

import { FetchInstance, URLENCODED_CONTENT } from '../../interfaces';
import {
  AuthCache,
  RequestParameters,
  SecurityConfiguration,
} from '../../security';
import { HttpHandler } from './http';

const mockFetch = jest.fn();

describe('HttpHandler', () => {
  let httpHandler: HttpHandler;
  let parameters: RequestParameters;
  let configuration: SecurityConfiguration & { type: SecurityType.HTTP };
  const fetchInstance: FetchInstance & AuthCache = {
    fetch: mockFetch,
  };
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
        (await httpHandler.authenticate(parameters, fetchInstance)).headers?.[
          'Authorization'
        ]
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
        (await httpHandler.authenticate(parameters, fetchInstance)).headers?.[
          'Authorization'
        ]
      ).toEqual('Bearer secret');
    });
  });
});
