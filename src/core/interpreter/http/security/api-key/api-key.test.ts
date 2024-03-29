import { ApiKeyPlacement, SecurityType } from '@superfaceai/ast';

import { SDKExecutionError } from '../../../../../lib';
import {
  FORMDATA_CONTENT,
  JSON_CONTENT,
  URLENCODED_CONTENT,
} from '../../interfaces';
import type { RequestParameters, SecurityConfiguration } from '..';
import { ApiKeyHandler } from './api-key';

describe('ApiKeyHandler', () => {
  let apiKeyHandler: ApiKeyHandler;
  let parameters: RequestParameters;
  let configuration: SecurityConfiguration & { type: SecurityType.APIKEY };

  describe('in header', () => {
    beforeEach(() => {
      parameters = {
        url: '',
        baseUrl: '',
        method: 'get',
        headers: {},
        pathParameters: {},
        queryParameters: {},
        body: undefined,
        contentType: JSON_CONTENT,
      };
      configuration = {
        id: 'test',
        type: SecurityType.APIKEY,
        in: ApiKeyPlacement.HEADER,
        name: undefined,
        apikey: 'secret',
      };
      apiKeyHandler = new ApiKeyHandler(configuration);
    });

    it('sets header to correct value', async () => {
      expect(
        (await apiKeyHandler.authenticate(parameters)).headers?.[
          'Authorization'
        ]
      ).toEqual('secret');
    });

    it('sets custom header to correct value', async () => {
      configuration.name = 'test';

      expect(
        (await apiKeyHandler.authenticate(parameters)).headers?.test
      ).toEqual('secret');
    });
  });

  describe('in path', () => {
    beforeEach(() => {
      parameters = {
        url: '/api/{Authorization}/',
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
        type: SecurityType.APIKEY,
        in: ApiKeyPlacement.PATH,
        name: undefined,
        apikey: 'secret',
      };
      apiKeyHandler = new ApiKeyHandler(configuration);
    });

    it('sets pathParameters to correct value', async () => {
      expect(
        (await apiKeyHandler.authenticate(parameters)).pathParameters
      ).toMatchObject({ Authorization: 'secret' });
    });

    it('sets pathParameters header to correct value', async () => {
      parameters = {
        url: '/api/{test}/',
        baseUrl: 'https://test.com/',
        method: 'get',
        headers: {},
        pathParameters: {},
        queryParameters: {},
        body: undefined,
        contentType: URLENCODED_CONTENT,
      };
      configuration.name = 'test';

      expect(
        (await apiKeyHandler.authenticate(parameters)).pathParameters
      ).toMatchObject({ test: 'secret' });
    });
  });

  describe('in query', () => {
    beforeEach(() => {
      parameters = {
        url: '/api',
        baseUrl: 'https://test.com',
        method: 'get',
        headers: {},
        pathParameters: {},
        queryParameters: {},
        body: undefined,
        contentType: FORMDATA_CONTENT,
      };
      configuration = {
        id: 'test',
        type: SecurityType.APIKEY,
        in: ApiKeyPlacement.QUERY,
        name: undefined,
        apikey: 'secret',
      };
      apiKeyHandler = new ApiKeyHandler(configuration);
    });

    it('sets query to correct value', async () => {
      expect(
        (await apiKeyHandler.authenticate(parameters)).queryParameters
      ).toMatchObject({ Authorization: 'secret' });
    });

    it('sets query header to correct value', async () => {
      configuration.name = 'test';

      expect(
        (await apiKeyHandler.authenticate(parameters)).queryParameters
      ).toMatchObject({ test: 'secret' });
    });
  });

  describe('in body', () => {
    beforeEach(() => {
      parameters = {
        url: '',
        baseUrl: '',
        method: 'get',
        headers: {},
        pathParameters: {},
        queryParameters: {},
        body: undefined,
        contentType: JSON_CONTENT,
      };
      configuration = {
        id: 'test',
        type: SecurityType.APIKEY,
        in: ApiKeyPlacement.BODY,
        name: undefined,
        apikey: 'secret',
      };
      apiKeyHandler = new ApiKeyHandler(configuration);
    });

    it('sets name with Primitive type', async () => {
      configuration.name = 'token';

      expect((await apiKeyHandler.authenticate(parameters)).body).toMatchObject(
        { token: 'secret' }
      );
    });

    it('creates new nested sctructure', async () => {
      configuration.name = '/a/b/c';

      expect((await apiKeyHandler.authenticate(parameters)).body).toMatchObject(
        {
          a: {
            b: {
              c: 'secret',
            },
          },
        }
      );
    });

    it('keep content of existing objects', async () => {
      parameters.body = { d: 'existing' };
      configuration.name = '/a/b/c';

      expect((await apiKeyHandler.authenticate(parameters)).body).toMatchObject(
        {
          d: 'existing',
          a: {
            b: {
              c: 'secret',
            },
          },
        }
      );
    });

    it('keep content of existing query parameters', async () => {
      parameters.queryParameters = { d: 'existing' };
      configuration.in = ApiKeyPlacement.QUERY;
      configuration.name = 'test';

      expect(
        (await apiKeyHandler.authenticate(parameters)).queryParameters
      ).toMatchObject({
        d: 'existing',
        test: 'secret',
      });
    });

    it('throws exception if request body is array', async () => {
      parameters.body = [];
      parameters.contentType = JSON_CONTENT;
      await expect(async () =>
        apiKeyHandler.authenticate(parameters)
      ).rejects.toThrow(
        new SDKExecutionError(
          'ApiKey in body can be used only on object.',
          ['Actual body is Array'],
          []
        )
      );
    });

    it('throws exception if in body path is array', async () => {
      parameters.body = { a: { b: [] } };
      parameters.contentType = JSON_CONTENT;
      configuration.name = '/a/b/c';
      await expect(async () =>
        apiKeyHandler.authenticate(parameters)
      ).rejects.toThrow(
        new SDKExecutionError(
          'ApiKey in body can be used only on object.',
          ['Actual value at /a/b is Array'],
          []
        )
      );
    });

    it('throws exception if Primitive value is in body path', async () => {
      parameters.body = { a: { b: { c: 'xxx' } } };
      parameters.contentType = JSON_CONTENT;
      configuration.name = '/a/b/c';
      await expect(async () =>
        apiKeyHandler.authenticate(parameters)
      ).rejects.toThrow(
        new SDKExecutionError(
          'ApiKey in body can be used only on object.',
          ['Actual value at /a/b/c is string'],
          []
        )
      );
    });
  });
});
