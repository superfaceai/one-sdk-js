/* eslint-disable @typescript-eslint/no-non-null-asserted-optional-chain */
import { SuperCache } from '../../../lib';
import {
  authenticateFilter,
  bodyFilter,
  fetchFilter,
  handleResponseFilter,
  headersFilter,
  methodFilter,
  queryParametersFilter,
  urlFilter,
  withRequest,
  withResponse,
} from './filters';
import {
  FORMDATA_CONTENT,
  isBinaryBody,
  isFormDataBody,
  isUrlSearchParamsBody,
  JSON_CONTENT,
  URLENCODED_CONTENT,
} from './interfaces';

describe('HTTP Filters', () => {
  const fetchInstance = {
    fetch: jest.fn().mockResolvedValue({ status: 200, body: '' }),
    digest: new SuperCache<string>(),
  };
  const defaultResponse = {
    statusCode: 200,
    body: '',
    headers: {},
    debug: { request: { headers: {}, url: '', body: {} } },
  };

  beforeEach(() => {
    fetchInstance.fetch.mockClear();
  });

  describe('withRequest', () => {
    it('asserts that request is present', async () => {
      const filter = jest.fn();
      const filterWithRequest = withRequest(filter);

      await expect(
        filterWithRequest({
          request: undefined,
          parameters: { url: '', method: '', baseUrl: '' },
        })
      ).rejects.toMatchObject({ message: 'Request is not complete' });
      expect(filter).not.toHaveBeenCalled();

      await expect(
        filterWithRequest({
          request: { url: '', method: '' },
          parameters: { url: '', method: '', baseUrl: '' },
        })
      ).resolves.not.toThrow();
      expect(filter).toHaveBeenCalled();
    });
  });

  describe('withResponse', () => {
    it('asserts that response is present', async () => {
      const filter = jest.fn();
      const filterWithResponse = withResponse(filter);

      await expect(
        filterWithResponse({
          parameters: { url: '', method: '', baseUrl: '' },
          response: undefined,
        })
      ).rejects.toMatchObject({
        message: 'Response in HTTP Request is undefined.',
      });
      expect(filter).not.toHaveBeenCalled();

      await expect(
        filterWithResponse({
          parameters: { url: '', method: '', baseUrl: '' },
          response: defaultResponse,
        })
      ).resolves.not.toThrow();
      expect(filter).toHaveBeenCalled();
    });
  });

  describe('fetchFilter', () => {
    it('should perform fetch request', async () => {
      const filter = fetchFilter(fetchInstance);
      await filter({
        parameters: { url: '', method: '', baseUrl: '' },
        request: { url: '', method: '' },
      });

      expect(fetchInstance.fetch).toHaveBeenCalled();
    });
  });

  describe('authenticateFilter', () => {
    it('should perform authentication handling', async () => {
      const handler = {
        configuration: {} as any,
        authenticate: jest.fn(),
      };
      const filter = authenticateFilter(handler);
      await filter({
        parameters: { url: '', method: '', baseUrl: '' },
      });

      expect(handler.authenticate).toHaveBeenCalled();
    });

    it('should pass parameters if no handler is present', async () => {
      const filter = authenticateFilter();
      const parameters = {
        parameters: { url: '', method: '', baseUrl: '' },
        request: undefined,
        response: undefined,
      };
      const result = await filter(parameters);

      expect(result).toStrictEqual(parameters);
    });
  });

  describe('handleResponseFilter', () => {
    it('should handle authentication response - does not perform new request', async () => {
      const handler = {
        configuration: {} as any,
        authenticate: jest.fn(),
        handleResponse: jest.fn(),
      };
      const filter = handleResponseFilter(fetchInstance, undefined, handler);

      await filter({
        parameters: { url: '', method: '', baseUrl: '' },
        response: defaultResponse,
      });

      expect(handler.handleResponse).toHaveBeenCalled();
      expect(fetchInstance.fetch).not.toHaveBeenCalled();
    });

    it('should handle authentication response - performs new request', async () => {
      const handler = {
        configuration: {} as any,
        authenticate: jest.fn(),
        handleResponse: jest.fn().mockResolvedValue({ url: '', method: '' }),
      };
      const filter = handleResponseFilter(fetchInstance, undefined, handler);

      await filter({
        parameters: { url: '', method: '', baseUrl: '' },
        response: defaultResponse,
      });

      expect(handler.handleResponse).toHaveBeenCalled();
      expect(fetchInstance.fetch).toHaveBeenCalled();
    });

    it('should pass parameters if no handler is present', async () => {
      const filter = handleResponseFilter(fetchInstance);
      const parameters = {
        parameters: { url: '', method: '', baseUrl: '' },
        request: undefined,
        response: defaultResponse,
      };
      const result = await filter(parameters);

      expect(result).toStrictEqual(parameters);
    });

    it('should pass parameters if handler does not have handleResponse', async () => {
      const handler = {
        configuration: {} as any,
        authenticate: jest.fn(),
      };
      const filter = handleResponseFilter(fetchInstance, undefined, handler);

      const parameters = {
        parameters: { url: '', method: '', baseUrl: '' },
        request: undefined,
        response: defaultResponse,
      };
      const result = await filter(parameters);

      expect(result).toStrictEqual(parameters);
    });
  });

  describe('urlFilter', () => {
    it('should create URL from parameters', async () => {
      const result = await urlFilter({
        parameters: {
          url: '/test',
          method: '',
          baseUrl: 'https://example.com',
        },
      });

      expect(result.request?.url).toEqual('https://example.com/test');
    });
  });

  describe('bodyFilter', () => {
    it('should create body from parameters - JSON body', async () => {
      const result = await bodyFilter({
        parameters: {
          url: '/test',
          method: '',
          baseUrl: 'https://example.com',
          body: {
            test: 'test',
          },
          contentType: 'application/json',
        },
      });

      expect(result.request?.body?.data).toEqual(
        JSON.stringify({ test: 'test' })
      );
    });

    it('should create body from parameters - URLSearchParams body', async () => {
      const result = await bodyFilter({
        parameters: {
          url: '/test',
          method: '',
          baseUrl: 'https://example.com',
          body: {
            test: 'test',
          },
          contentType: URLENCODED_CONTENT,
        },
      });

      expect(isUrlSearchParamsBody(result.request?.body!)).toBe(true);
    });

    it('should create body from parameters - FormData body', async () => {
      const result = await bodyFilter({
        parameters: {
          url: '/test',
          method: '',
          baseUrl: 'https://example.com',
          body: {
            test: 'test',
          },
          contentType: FORMDATA_CONTENT,
        },
      });

      expect(isFormDataBody(result.request?.body!)).toBe(true);
    });

    it('should create body from parameters - binary body', async () => {
      const result = await bodyFilter({
        parameters: {
          url: '/test',
          method: '',
          baseUrl: 'https://example.com',
          body: {
            test: 'test',
          },
          contentType: 'image/jpeg',
        },
      });

      expect(isBinaryBody(result.request?.body!)).toBe(true);
    });

    it('should throw on unsupported body type', async () => {
      expect(() =>
        bodyFilter({
          parameters: {
            url: '/test',
            method: '',
            baseUrl: 'https://example.com',
            body: {
              test: 'test',
            },
            contentType: 'un/supported',
          },
        })
      ).toThrow('Content type not supported');
    });
  });

  describe('queryParametersFilter', () => {
    it('should create query from parameters', async () => {
      const result = await queryParametersFilter({
        parameters: {
          url: '/test',
          method: '',
          baseUrl: 'https://example.com',
          queryParameters: {
            test: 'test',
          },
        },
      });

      expect(result.request?.queryParameters).toMatchObject({ test: 'test' });
    });
  });

  describe('methodFilter', () => {
    it('should create request method from parameters', async () => {
      const result = await methodFilter({
        parameters: {
          url: '/test',
          method: 'GET',
          baseUrl: 'https://example.com',
        },
      });

      expect(result.request?.method).toEqual('GET');
    });
  });

  describe('headersFilter', () => {
    it('should create headers from parameters', async () => {
      const result = await headersFilter({
        parameters: {
          url: '/test',
          method: '',
          baseUrl: 'https://example.com',
          headers: {
            test: 'test',
          },
          contentType: JSON_CONTENT,
        },
      });

      expect(result.request?.headers).toMatchObject({
        test: 'test',
        'content-type': JSON_CONTENT,
      });
    });

    it("doesn't set content-type for multipart/form-data", async () => {
      const result = await headersFilter({
        parameters: {
          url: '/test',
          method: '',
          baseUrl: 'https://example.com',
          headers: {
            test: 'test',
          },
          contentType: FORMDATA_CONTENT,
        },
      });

      expect(result.request?.headers).toMatchObject({
        test: 'test',
      });
      expect(result.request?.headers).toEqual(
        expect.not.objectContaining({
          'content-type': expect.anything(),
        })
      );
    });

    it("doesn't set accept header if already exists", async () => {
      const result = await headersFilter({
        parameters: {
          url: '/test',
          method: '',
          baseUrl: 'https://example.com',
          headers: {
            aCcEpT: 'application/json',
          },
          accept: 'text/plain',
          contentType: JSON_CONTENT,
        },
      });

      expect(result.request?.headers?.accept).toBe(undefined);
    });
  });
});
