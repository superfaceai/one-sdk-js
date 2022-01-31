import {
  DigestSecurityScheme,
  DigestSecurityValues,
  HttpScheme,
  SecurityType,
} from '@superfaceai/ast';
import { createHash } from 'crypto';

import {
  digestHeaderNotFound,
  missingPartOfDigestHeader,
  unexpectedDigestValue,
} from '../../../../errors.helpers';
import { HttpResponse } from '../../http';
import { FetchInstance, URLENCODED_CONTENT } from '../../interfaces';
import { HttpRequest } from '..';
import {
  AuthCache,
  DEFAULT_AUTHORIZATION_HEADER_NAME,
  RequestParameters,
} from '../interfaces';
import { DigestHandler } from './digest';

const mockFetch = jest.fn();

describe('DigestHandler', () => {
  const id = 'digest';
  const scheme = HttpScheme.DIGEST;
  const type = SecurityType.HTTP;
  const username = 'test-user';
  const password = 'test-password';
  const mockUri = '/pms_api/91508/121/bookings/10619';
  const mockUrl = 'https://sky-eu1.clock-software.com' + mockUri;
  const mockRealm = 'API';
  const mockNonce =
    'MTYzODM0OTE4Nzo0YTdlODlmYjI3ODZiZGZhNDhiODAwM2NmNjIwMzE2OQ==';
  const mockCnonce = '9e3355cb6a75d66ce7eea7fc7fc8526d';
  const mockOpaque = 'b816d4d26130bed8ccf5149e855000ad';
  const method = 'get';
  const mockHeader = `Digest realm="${mockRealm}" nonce="${mockNonce}", opaque="${mockOpaque}"`;

  //Prepare digest response
  const h1 = createHash('MD5')
    .update(`${username}:${mockRealm}:${password}`)
    .digest('hex');
  const h2 = createHash('MD5').update(`${method}:${mockUri}`).digest('hex');
  const digestResponse = createHash('MD5')
    .update(`${h1}:${mockNonce}:${h2}`)
    .digest('hex');

  let mockInstance: DigestHandler;
  let configuration: DigestSecurityScheme & DigestSecurityValues;
  let parameters: RequestParameters;
  let cache: AuthCache;
  let retryRequest: HttpRequest | undefined;

  const fetchInstance: FetchInstance & AuthCache = {
    fetch: mockFetch,
  };

  beforeEach(() => {
    configuration = {
      username,
      password,
      id,
      scheme,
      type,
    };
    parameters = {
      url: mockUri,
      baseUrl: mockUrl,
      method,
      headers: {},
      pathParameters: {},
      queryParameters: {},
      body: undefined,
      contentType: URLENCODED_CONTENT,
    };
    cache = {};

    mockFetch.mockImplementation(() => ({
      status: 401,
      body: undefined,
      headers: {
        ['www-authenticate']: mockHeader
      },
      debug: {
        request: {
          headers: {},
          url: '',
          body: undefined,
        },
      },
    }));
  });
  afterEach(() => {
    jest.resetAllMocks();
  });
  describe('prepare', () => {
    it.only('extracts values from challange request headers when cache is empty', async () => {
      mockInstance = new DigestHandler(configuration);

      expect(
        (await mockInstance.authenticate(parameters, fetchInstance)).headers?.Authorization
      ).toEqual(expect.stringContaining(`response="${digestResponse}"`));

      expect(fetchInstance).toEqual({
        digest: expect.stringContaining(`response="${digestResponse}"`),
      });
    });

    it('changes default authorization header when cache is not empty', async () => {
      mockInstance = new DigestHandler(configuration);

      expect(
        (await mockInstance.authenticate(parameters, fetchInstance)).headers
      ).toEqual({
        [DEFAULT_AUTHORIZATION_HEADER_NAME]: 'secret',
      });
    });

    it('changes custom authorization header when cache is not empty', async () => {
      configuration.authorizationHeader = 'custom';

      mockInstance = new DigestHandler(configuration);
      expect(
        (
          await mockInstance.authenticate(parameters, {
            ...fetchInstance,
            digest: 'secret',
          })
        ).headers
      ).toEqual({ custom: 'secret' });
    });
  });

  describe('handle', () => {
    it('returns undefined on unexpected status code', async () => {
      const qop = 'auth';
      const algorithm = 'MD5';

      const response: HttpResponse = {
        statusCode: 409,
        body: 'HTTP Digest: Access denied.\n',
        headers: {
          'www-authenticate': `Digest realm="${mockRealm}", qop="${qop}", algorithm=${algorithm}, nonce="${mockNonce}", opaque="${mockOpaque}", cnonce="${mockCnonce}"`,
        },
        debug: {
          request: {
            url: mockUrl,
            headers: {},
            body: undefined,
          },
        },
      };
      retryRequest = await new DigestHandler(configuration).handleResponse(
        response,
        parameters,
        fetchInstance
      );

      expect(retryRequest).toBeUndefined();
    });

    it('throws on missing challenge header', async () => {
      const response: HttpResponse = {
        statusCode: 401,
        body: 'HTTP Digest: Access denied.\n',
        headers: {},
        debug: {
          request: {
            url: mockUrl,
            headers: {},
            body: undefined,
          },
        },
      };

      expect(() =>
        new DigestHandler(configuration).handleResponse(
          response,
          parameters,
          fetchInstance
        )
      ).toThrow(digestHeaderNotFound('www-authenticate', []));
    });

    it('throws on corrupted challenge header - missing scheme', async () => {
      const qop = 'auth';
      const algorithm = 'MD5';
      const mockHeader = ` realm="${mockRealm}", qop="${qop}", algorithm=${algorithm}, nonce="${mockNonce}", opaque="${mockOpaque}"`;

      const response: HttpResponse = {
        statusCode: 401,
        body: 'HTTP Digest: Access denied.\n',
        headers: {
          'www-authenticate': mockHeader,
        },
        debug: {
          request: {
            url: mockUrl,
            headers: {},
            body: undefined,
          },
        },
      };

      expect(() =>
        new DigestHandler(configuration).handleResponse(
          response,
          parameters,
          fetchInstance
        )
      ).toThrow(
        missingPartOfDigestHeader('www-authenticate', mockHeader, 'scheme')
      );
    });

    it('throws on corrupted challenge header - missing nonce', async () => {
      const qop = 'auth';
      const algorithm = 'MD5';
      const mockHeader = `Digest realm="${mockRealm}", qop="${qop}", algorithm=${algorithm}, opaque="${mockOpaque}"`;

      const response: HttpResponse = {
        statusCode: 401,
        body: 'HTTP Digest: Access denied.\n',
        headers: {
          'www-authenticate': mockHeader,
        },
        debug: {
          request: {
            url: mockUrl,
            headers: {},
            body: undefined,
          },
        },
      };

      await expect(
        new DigestHandler(configuration).handleResponse(
          response,
          parameters,
          fetchInstance
        )
      ).rejects.toEqual(
        missingPartOfDigestHeader('www-authenticate', mockHeader, 'nonce')
      );
    });

    it('throws on unexpected algorithm', async () => {
      const algorithm = 'SOME_algorithm';
      const mockHeader = `Digest realm="${mockRealm}", algorithm=${algorithm}, nonce="${mockNonce}", opaque="${mockOpaque}"`;

      const response: HttpResponse = {
        statusCode: 401,
        body: 'HTTP Digest: Access denied.\n',
        headers: {
          'www-authenticate': mockHeader,
        },
        debug: {
          request: {
            url: mockUrl,
            headers: {},
            body: undefined,
          },
        },
      };

      await expect(
        new DigestHandler(configuration).handleResponse(
          response,
          parameters,
          fetchInstance
        )
      ).rejects.toEqual(
        unexpectedDigestValue('algorithm', algorithm, [
          'MD5',
          'MD5-sess',
          'SHA-256',
          'SHA-256-sess',
        ])
      );
    });

    it('throws on unexpected qop', async () => {
      const qop = 'some_qop';
      const mockHeader = `Digest realm="${mockRealm}", qop="${qop}", nonce="${mockNonce}", opaque="${mockOpaque}"`;

      const response: HttpResponse = {
        statusCode: 401,
        body: 'HTTP Digest: Access denied.\n',
        headers: {
          'www-authenticate': mockHeader,
        },
        debug: {
          request: {
            url: mockUrl,
            headers: {},
            body: undefined,
          },
        },
      };

      await expect(() =>
        new DigestHandler(configuration).handleResponse(
          response,
          parameters,
          fetchInstance
        )
      ).rejects.toEqual(
        unexpectedDigestValue('quality of protection', qop, [
          'auth',
          'auth-int',
        ])
      );
    });

    it('prepares digest auth without qop and algorithm', async () => {
      const method = 'GET';
      const mockHeader = `Digest realm="${mockRealm}" nonce="${mockNonce}", opaque="${mockOpaque}"`;
      mockInstance = new DigestHandler(configuration);

      //Prepare digest response
      const h1 = createHash('MD5')
        .update(`${username}:${mockRealm}:${password}`)
        .digest('hex');
      const h2 = createHash('MD5').update(`${method}:${mockUri}`).digest('hex');
      const digestResponse = createHash('MD5')
        .update(`${h1}:${mockNonce}:${h2}`)
        .digest('hex');

      const response: HttpResponse = {
        statusCode: 401,
        body: 'HTTP Digest: Access denied.\n',
        headers: {
          'www-authenticate': mockHeader,
        },
        debug: {
          request: {
            url: mockUrl,
            headers: {},
            body: undefined,
          },
        },
      };

      (mockInstance as any).makeNonce = () => mockCnonce;
      retryRequest = await mockInstance.handleResponse(response, parameters, {
        ...fetchInstance,
        ...cache,
      });

      expect(retryRequest?.headers).toEqual({
        [DEFAULT_AUTHORIZATION_HEADER_NAME]: expect.stringContaining(
          `response="${digestResponse}"`
        ),
      });
      expect(cache).toEqual({
        digest: expect.stringContaining(`response="${digestResponse}"`),
      });
    });

    it('prepares digest auth without qop and algorithm for custom authorization header', async () => {
      const method = 'GET';
      const mockHeader = `Digest realm="${mockRealm}" nonce="${mockNonce}", opaque="${mockOpaque}"`;
      configuration.authorizationHeader = 'Custom';
      mockInstance = new DigestHandler(configuration);

      //Prepare digest response
      const h1 = createHash('MD5')
        .update(`${username}:${mockRealm}:${password}`)
        .digest('hex');
      const h2 = createHash('MD5').update(`${method}:${mockUri}`).digest('hex');
      const digestResponse = createHash('MD5')
        .update(`${h1}:${mockNonce}:${h2}`)
        .digest('hex');

      const response: HttpResponse = {
        statusCode: 401,
        body: 'HTTP Digest: Access denied.\n',
        headers: {
          'www-authenticate': mockHeader,
        },
        debug: {
          request: {
            url: mockUrl,
            headers: {},
            body: undefined,
          },
        },
      };

      (mockInstance as any).makeNonce = () => mockCnonce;
      retryRequest = await mockInstance.handleResponse(response, parameters, {
        ...fetchInstance,
        ...cache,
      });

      expect(retryRequest?.headers).toEqual({
        Custom: expect.stringContaining(`response="${digestResponse}"`),
      });
      expect(cache).toEqual({
        digest: expect.stringContaining(`response="${digestResponse}"`),
      });
    });

    it('prepares digest auth with auth-int qop', async () => {
      const qop = 'auth-int';
      const method = 'GET';
      mockInstance = new DigestHandler(configuration);

      const h1 = createHash('MD5')
        .update(`${username}:${mockRealm}:${password}`)
        .digest('hex');
      const h2 = createHash('MD5').update(`${method}:${mockUri}`).digest('hex');
      const expectedResponse = createHash('MD5')
        .update(`${h1}:${mockNonce}:00000001:${mockCnonce}:${qop}:${h2}`)
        .digest('hex');

      const response: HttpResponse = {
        statusCode: 401,
        body: 'HTTP Digest: Access denied.\n',
        headers: {
          'www-authenticate': `Digest realm="${mockRealm}", qop="${qop}", nonce="${mockNonce}", opaque="${mockOpaque}"`,
        },
        debug: {
          request: {
            url: mockUrl,
            headers: {},
            body: undefined,
          },
        },
      };

      (mockInstance as any).makeNonce = () => mockCnonce;
      retryRequest = await mockInstance.handleResponse(response, parameters, {
        ...fetchInstance,
        ...cache,
      });

      expect(retryRequest?.headers).toEqual({
        [DEFAULT_AUTHORIZATION_HEADER_NAME]: expect.stringContaining(
          `response="${expectedResponse}"`
        ),
      });
      expect(cache).toEqual({
        digest: expect.stringContaining(`response="${expectedResponse}"`),
      });
    });

    it('prepares digest auth with default values and MD5', async () => {
      const qop = 'auth';
      const algorithm = 'MD5';
      const method = 'GET';
      mockInstance = new DigestHandler(configuration);

      const h1 = createHash(algorithm)
        .update(`${username}:${mockRealm}:${password}`)
        .digest('hex');
      const h2 = createHash(algorithm)
        .update(`${method}:${mockUri}`)
        .digest('hex');
      const expectedResponse = createHash(algorithm)
        .update(`${h1}:${mockNonce}:00000001:${mockCnonce}:${qop}:${h2}`)
        .digest('hex');

      const response: HttpResponse = {
        statusCode: 401,
        body: 'HTTP Digest: Access denied.\n',
        headers: {
          'www-authenticate': `Digest realm="${mockRealm}", qop="${qop}", algorithm=${algorithm}, nonce="${mockNonce}", opaque="${mockOpaque}"`,
        },
        debug: {
          request: {
            url: mockUrl,
            headers: {},
            body: undefined,
          },
        },
      };

      (mockInstance as any).makeNonce = () => mockCnonce;
      retryRequest = await mockInstance.handleResponse(response, parameters, {
        ...fetchInstance,
        ...cache,
      });

      expect(retryRequest?.headers).toEqual({
        [DEFAULT_AUTHORIZATION_HEADER_NAME]: expect.stringContaining(
          `response="${expectedResponse}"`
        ),
      });
      expect(cache).toEqual({
        digest: expect.stringContaining(`response="${expectedResponse}"`),
      });
    });

    it('prepares digest auth with default values, custom headers and status code', async () => {
      const qop = 'auth';
      const algorithm = 'MD5';
      const method = 'GET';
      configuration.authorizationHeader = 'Auth';
      configuration.challengeHeader = 'Challenge';
      configuration.statusCode = 432;
      mockInstance = new DigestHandler(configuration);

      const h1 = createHash(algorithm)
        .update(`${username}:${mockRealm}:${password}`)
        .digest('hex');
      const h2 = createHash(algorithm)
        .update(`${method}:${mockUri}`)
        .digest('hex');
      const expectedResponse = createHash(algorithm)
        .update(`${h1}:${mockNonce}:00000001:${mockCnonce}:${qop}:${h2}`)
        .digest('hex');

      const response: HttpResponse = {
        statusCode: 432,
        body: 'HTTP Digest: Access denied.\n',
        headers: {
          Challenge: `Digest realm="${mockRealm}", qop="${qop}", nonce="${mockNonce}", opaque="${mockOpaque}"`,
        },
        debug: {
          request: {
            url: mockUrl,
            headers: {},
            body: undefined,
          },
        },
      };

      (mockInstance as any).makeNonce = () => mockCnonce;
      retryRequest = await mockInstance.handleResponse(response, parameters, {
        ...fetchInstance,
        ...cache,
      });

      expect(retryRequest?.headers).toEqual({
        Auth: expect.stringContaining(`response="${expectedResponse}"`),
      });
      expect(cache).toEqual({
        digest: expect.stringContaining(`response="${expectedResponse}"`),
      });
    });

    it('prepares digest auth with default values and MD5-sess', async () => {
      const qop = 'auth';
      const algorithm = 'MD5-sess';
      const method = 'GET';
      mockInstance = new DigestHandler(configuration);

      let h1 = createHash('MD5')
        .update(`${username}:${mockRealm}:${password}`)
        .digest('hex');
      h1 = createHash('MD5')
        .update(`${h1}:${mockNonce}:${mockCnonce}`)
        .digest('hex');
      const h2 = createHash('MD5').update(`${method}:${mockUri}`).digest('hex');
      const expectedResponse = createHash('MD5')
        .update(`${h1}:${mockNonce}:00000001:${mockCnonce}:${qop}:${h2}`)
        .digest('hex');

      const response: HttpResponse = {
        statusCode: 401,
        body: 'HTTP Digest: Access denied.\n',
        headers: {
          'www-authenticate': `Digest realm="${mockRealm}", qop="${qop}", algorithm=${algorithm}, nonce="${mockNonce}", opaque="${mockOpaque}"`,
        },
        debug: {
          request: {
            url: mockUrl,
            headers: {},
            body: undefined,
          },
        },
      };

      (mockInstance as any).makeNonce = () => mockCnonce;

      retryRequest = await mockInstance.handleResponse(response, parameters, {
        ...fetchInstance,
        ...cache,
      });

      expect(retryRequest?.headers).toEqual({
        [DEFAULT_AUTHORIZATION_HEADER_NAME]: expect.stringContaining(
          `response="${expectedResponse}"`
        ),
      });
      expect(cache).toEqual({
        digest: expect.stringContaining(`response="${expectedResponse}"`),
      });
    });

    it('prepares digest auth with default values and SHA-256', async () => {
      const qop = 'auth';
      const algorithm = 'SHA-256';
      const method = 'GET';
      mockInstance = new DigestHandler(configuration);

      const h1 = createHash('sha256')
        .update(`${username}:${mockRealm}:${password}`)
        .digest('hex');
      const h2 = createHash('sha256')
        .update(`${method}:${mockUri}`)
        .digest('hex');
      const expectedResponse = createHash('sha256')
        .update(`${h1}:${mockNonce}:00000001:${mockCnonce}:${qop}:${h2}`)
        .digest('hex');

      const response: HttpResponse = {
        statusCode: 401,
        body: 'HTTP Digest: Access denied.\n',
        headers: {
          'www-authenticate': `Digest realm="${mockRealm}", qop="${qop}", algorithm=${algorithm}, nonce="${mockNonce}", opaque="${mockOpaque}"`,
        },
        debug: {
          request: {
            url: mockUrl,
            headers: {},
            body: undefined,
          },
        },
      };

      (mockInstance as any).makeNonce = () => mockCnonce;

      retryRequest = await mockInstance.handleResponse(response, parameters, {
        ...fetchInstance,
        ...cache,
      });

      expect(retryRequest?.headers).toEqual({
        [DEFAULT_AUTHORIZATION_HEADER_NAME]: expect.stringContaining(
          `response="${expectedResponse}"`
        ),
      });
      expect(cache).toEqual({
        digest: expect.stringContaining(`response="${expectedResponse}"`),
      });
    });

    it('prepares digest auth with default values and SHA-256-sess', async () => {
      const qop = 'auth';
      const algorithm = 'SHA-256-sess';
      const method = 'GET';
      mockInstance = new DigestHandler(configuration);

      let h1 = createHash('sha256')
        .update(`${username}:${mockRealm}:${password}`)
        .digest('hex');
      h1 = createHash('sha256')
        .update(`${h1}:${mockNonce}:${mockCnonce}`)
        .digest('hex');
      const h2 = createHash('sha256')
        .update(`${method}:${mockUri}`)
        .digest('hex');
      const expectedResponse = createHash('sha256')
        .update(`${h1}:${mockNonce}:00000001:${mockCnonce}:${qop}:${h2}`)
        .digest('hex');

      const response: HttpResponse = {
        statusCode: 401,
        body: 'HTTP Digest: Access denied.\n',
        headers: {
          'www-authenticate': `Digest realm="${mockRealm}", qop="${qop}", algorithm=${algorithm}, nonce="${mockNonce}", opaque="${mockOpaque}"`,
        },
        debug: {
          request: {
            url: mockUrl,
            headers: {},
            body: undefined,
          },
        },
      };

      (mockInstance as any).makeNonce = () => mockCnonce;

      retryRequest = await mockInstance.handleResponse(response, parameters, {
        ...fetchInstance,
        ...cache,
      });

      expect(retryRequest?.headers).toEqual({
        [DEFAULT_AUTHORIZATION_HEADER_NAME]: expect.stringContaining(
          `response="${expectedResponse}"`
        ),
      });
      expect(cache).toEqual({
        digest: expect.stringContaining(`response="${expectedResponse}"`),
      });
    });
  });
});
