import {
  DigestSecurityScheme,
  DigestSecurityValues,
  HttpScheme,
  SecurityType,
} from '@superfaceai/ast';
import { createHash } from 'crypto';
import { DEFAULT_AUTHORIZATION_HEADER_NAME } from '..';
import { AuthCache } from '../../../../..';

import { UnexpectedError } from '../../../../errors';
import { HttpResponse } from '../../http';
import { RequestContext } from '../interfaces';
import { DigestHandler } from './digest';

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
  let mockInstance: DigestHandler;
  let configuration: DigestSecurityScheme & DigestSecurityValues;
  let context: RequestContext;
  let cache: AuthCache;
  let retry: boolean;

  beforeEach(() => {
    configuration = {
      username,
      password,
      id,
      scheme,
      type,
    };
    context = {
      pathParameters: {},
      queryAuth: {},
      headers: {},
      requestBody: undefined,
    };
    cache = {};
  });
  afterEach(() => {
    jest.resetAllMocks();
  });
  describe('prepare', () => {
    it('does not change headers when cache is empty', () => {
      mockInstance = new DigestHandler(configuration);
      mockInstance.prepare(context, {});

      expect(context.headers).toEqual({});
    });

    it('changes default authorization header when cache is not empty', () => {
      mockInstance = new DigestHandler(configuration);
      mockInstance.prepare(context, { digest: 'secret' });

      expect(context.headers).toEqual({
        [DEFAULT_AUTHORIZATION_HEADER_NAME]: 'secret',
      });
    });

    it('changes custom authorization header when cache is not empty', () => {
      configuration.authorizationHeader = 'custom';

      mockInstance = new DigestHandler(configuration);
      mockInstance.prepare(context, { digest: 'secret' });

      expect(context.headers).toEqual({ custom: 'secret' });
    });
  });

  describe('handle', () => {
    it('returns undefined on unexpected status code', () => {
      const qop = 'auth';
      const algorithm = 'MD5';
      const method = 'GET';

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
      retry = new DigestHandler(configuration).handle(
        response,
        mockUrl,
        method,
        context,
        {}
      );

      expect(retry).toEqual(false);
      expect(context.headers).toEqual({});
    });

    it('throws on missing challenge header', async () => {
      const method = 'GET';

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
        new DigestHandler(configuration).handle(
          response,
          mockUrl,
          method,
          context,
          {}
        )
      ).toThrow(
        new UnexpectedError(
          `Digest auth failed, unable to extract digest values from response. Header "www-authenticate" not found in response headers.`
          //FIX: casting
        ) as unknown as Error
      );
    });

    it('throws on corrupted challenge header - missing scheme', async () => {
      const qop = 'auth';
      const algorithm = 'MD5';
      const method = 'GET';
      const mockheader = ` realm="${mockRealm}", qop="${qop}", algorithm=${algorithm}, nonce="${mockNonce}", opaque="${mockOpaque}"`;

      const response: HttpResponse = {
        statusCode: 401,
        body: 'HTTP Digest: Access denied.\n',
        headers: {
          'www-authenticate': mockheader,
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
        new DigestHandler(configuration).handle(
          response,
          mockUrl,
          method,
          context,
          {}
        )
      ).toThrow(
        new UnexpectedError(
          `Digest auth failed, unable to extract digest values from response. Header "www-authenticate" does not contain scheme value eq. Digest`,
          mockheader
          //FIX: casting
        ) as unknown as Error
      );
    });

    it('throws on corrupted challenge header - missing nonce', async () => {
      const qop = 'auth';
      const algorithm = 'MD5';
      const method = 'GET';
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

      expect(() =>
        new DigestHandler(configuration).handle(
          response,
          mockUrl,
          method,
          context,
          {}
        )
      ).toThrow(
        new UnexpectedError(
          `Digest auth failed, unable to extract digest values from response. Header "www-authenticate" does not contain "nonce"`,
          mockHeader
          //FIX: casting
        ) as unknown as Error
      );
    });

    it('throws on unexpected algorithm', async () => {
      const algorithm = 'SOME_algorithm';
      const method = 'GET';
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

      expect(() =>
        new DigestHandler(configuration).handle(
          response,
          mockUrl,
          method,
          context,
          {}
        )
      ).toThrow(
        new UnexpectedError(
          `Digest auth failed, parameter "algorithm" has unexpected value`,
          algorithm
          //FIX: casting
        ) as unknown as Error
      );
    });

    it('throws on unexpected qop', async () => {
      const qop = 'some_qop';
      const method = 'GET';
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

      expect(() =>
        new DigestHandler(configuration).handle(
          response,
          mockUrl,
          method,
          context,
          {}
        )
      ).toThrow(
        new UnexpectedError(
          `Digest auth failed, parameter "quality of protection" has unexpected value`,
          qop
          //FIX: casting
        ) as unknown as Error
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
      retry = mockInstance.handle(response, mockUrl, method, context, cache);

      expect(retry).toEqual(true);
      expect(context.headers).toEqual({
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
      retry = mockInstance.handle(response, mockUrl, method, context, cache);

      expect(retry).toEqual(true);
      expect(context.headers).toEqual({
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
      retry = mockInstance.handle(response, mockUrl, method, context, cache);

      expect(retry).toEqual(true);
      expect(context.headers).toEqual({
        [DEFAULT_AUTHORIZATION_HEADER_NAME]: expect.stringContaining(`response="${expectedResponse}"`),
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
      retry = mockInstance.handle(response, mockUrl, method, context, cache);

      expect(retry).toEqual(true);
      expect(context.headers).toEqual({
        [DEFAULT_AUTHORIZATION_HEADER_NAME]: expect.stringContaining(`response="${expectedResponse}"`),
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
          'Challenge': `Digest realm="${mockRealm}", qop="${qop}", nonce="${mockNonce}", opaque="${mockOpaque}"`,
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
      retry = mockInstance.handle(response, mockUrl, method, context, cache);

      expect(retry).toEqual(true);
      expect(context.headers).toEqual({
        'Auth': expect.stringContaining(`response="${expectedResponse}"`),
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

      retry = mockInstance.handle(response, mockUrl, method, context, cache);

      expect(retry).toEqual(true);
      expect(context.headers).toEqual({
        [DEFAULT_AUTHORIZATION_HEADER_NAME]: expect.stringContaining(`response="${expectedResponse}"`),
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

      retry = mockInstance.handle(response, mockUrl, method, context, cache);

      expect(retry).toEqual(true);
      expect(context.headers).toEqual({
        [DEFAULT_AUTHORIZATION_HEADER_NAME]: expect.stringContaining(`response="${expectedResponse}"`),
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

      retry = mockInstance.handle(response, mockUrl, method, context, cache);

      expect(retry).toEqual(true);
      expect(context.headers).toEqual({
        [DEFAULT_AUTHORIZATION_HEADER_NAME]: expect.stringContaining(`response="${expectedResponse}"`),
      });
      expect(cache).toEqual({
        digest: expect.stringContaining(`response="${expectedResponse}"`),
      });
    });
  });
});
