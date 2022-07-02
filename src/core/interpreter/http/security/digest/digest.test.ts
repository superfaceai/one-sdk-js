import {
  DigestSecurityScheme,
  DigestSecurityValues,
  HttpScheme,
  SecurityType,
} from '@superfaceai/ast';
import { createHash } from 'crypto';

import { SuperCache } from '../../../../../lib';
import { NodeCrypto } from '../../../../../node';
import {
  digestHeaderNotFound,
  missingPartOfDigestHeader,
  unexpectedDigestValue,
} from '../../../../errors';
import { IFetch, URLENCODED_CONTENT } from '../../interfaces';
import { HttpResponse } from '../../types';
import { HttpRequest } from '..';
import {
  AuthCache,
  DEFAULT_AUTHORIZATION_HEADER_NAME,
  RequestParameters,
} from '../interfaces';
import { DigestHandler, hashDigestConfiguration } from './digest';

const mockFetch = jest.fn();
const crypto = new NodeCrypto();

describe('DigestHandler', () => {
  const id = 'digest';
  const scheme = HttpScheme.DIGEST;
  const type = SecurityType.HTTP;
  const username = 'test-user';
  const password = 'test-password';
  const mockUri = '/pms_api/91508/121/bookings/10619';
  const mockUrl = 'https://sky-eu1.clock-software.com';
  const mockRealm = 'API';
  const mockNonce =
    'MTYzODM0OTE4Nzo0YTdlODlmYjI3ODZiZGZhNDhiODAwM2NmNjIwMzE2OQ==';
  const mockCnonce = '9e3355cb6a75d66ce7eea7fc7fc8526d';
  const mockOpaque = 'b816d4d26130bed8ccf5149e855000ad';
  const method = 'GET';

  let mockInstance: DigestHandler;
  let configuration: DigestSecurityScheme & DigestSecurityValues;
  let parameters: RequestParameters;
  let retryRequest: HttpRequest | undefined;

  const fetchInstance: IFetch & AuthCache = {
    digest: new SuperCache<string>(),
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
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('prepare', () => {
    it('extracts values from challange request headers when cache is empty', async () => {
      const qop = 'auth';
      const algorithm = 'MD5';

      // Prepare digest response
      const h1 = createHash(algorithm)
        .update(`${username}:${mockRealm}:${password}`)
        .digest('hex');

      const h2 = createHash(algorithm)
        .update(`${method}:${mockUri}`)
        .digest('hex');

      const digestResponse = createHash(algorithm)
        .update(`${h1}:${mockNonce}:00000001:${mockCnonce}:${qop}:${h2}`)
        .digest('hex');

      mockFetch.mockImplementation(() => ({
        status: 401,
        body: undefined,
        headers: {
          ['www-authenticate']: `Digest realm="${mockRealm}", qop="${qop}", nonce="${mockNonce}", opaque="${mockOpaque}"`,
        },
        debug: {
          request: {
            headers: {},
            url: mockUrl + mockUri,
            body: undefined,
          },
        },
      }));

      mockInstance = new DigestHandler(configuration, fetchInstance, crypto);
      (mockInstance as any).makeNonce = () => mockCnonce;

      expect(
        (await mockInstance.authenticate(parameters)).headers?.Authorization
      ).toEqual(expect.stringContaining(`response="${digestResponse}"`));

      expect(
        fetchInstance.digest.getCached(
          hashDigestConfiguration(configuration, crypto),
          () => ''
        )
      ).toEqual(expect.stringContaining(`response="${digestResponse}"`));
    });

    it('changes default authorization header when cache is not empty', async () => {
      const digest = new SuperCache<string>();
      digest.getCached(
        hashDigestConfiguration(configuration, crypto),
        () => 'secret'
      );
      mockInstance = new DigestHandler(
        configuration,
        {
          ...fetchInstance,
          digest,
        },
        crypto
      );

      expect(
        (await mockInstance.authenticate(parameters)).headers?.[
          DEFAULT_AUTHORIZATION_HEADER_NAME
        ]
      ).toEqual('secret');
    });

    it('changes custom authorization header when cache is not empty', async () => {
      const digest = new SuperCache<string>();
      digest.getCached(
        hashDigestConfiguration(configuration, crypto),
        () => 'secret'
      );
      configuration.authorizationHeader = 'custom';

      mockInstance = new DigestHandler(
        configuration,
        {
          ...fetchInstance,
          digest,
        },
        crypto
      );
      expect(
        (await mockInstance.authenticate(parameters)).headers?.custom
      ).toEqual('secret');
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
      retryRequest = await new DigestHandler(
        configuration,
        fetchInstance,
        crypto
      ).handleResponse(response, parameters);

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

      await expect(async () =>
        new DigestHandler(configuration, fetchInstance, crypto).handleResponse(
          response,
          parameters
        )
      ).rejects.toThrow(digestHeaderNotFound('www-authenticate', []));
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

      await expect(async () =>
        new DigestHandler(configuration, fetchInstance, crypto).handleResponse(
          response,
          parameters
        )
      ).rejects.toThrow(
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

      await expect(async () =>
        new DigestHandler(configuration, fetchInstance, crypto).handleResponse(
          response,
          parameters
        )
      ).rejects.toThrow(
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

      await expect(async () =>
        new DigestHandler(configuration, fetchInstance, crypto).handleResponse(
          response,
          parameters
        )
      ).rejects.toThrow(
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

      await expect(async () =>
        new DigestHandler(configuration, fetchInstance, crypto).handleResponse(
          response,
          parameters
        )
      ).rejects.toThrow(
        unexpectedDigestValue('quality of protection', qop, [
          'auth',
          'auth-int',
        ])
      );
    });

    it('prepares digest auth without qop and algorithm', async () => {
      const method = 'GET';
      const mockHeader = `Digest realm="${mockRealm}" nonce="${mockNonce}", opaque="${mockOpaque}"`;

      // Prepare digest response
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
            url: mockUrl + mockUri,
            headers: {},
            body: undefined,
          },
        },
      };

      const cacheAndFetch: IFetch & AuthCache = {
        ...fetchInstance,
      };
      mockInstance = new DigestHandler(configuration, cacheAndFetch, crypto);

      (mockInstance as any).makeNonce = () => mockCnonce;
      retryRequest = await mockInstance.handleResponse(response, parameters);

      expect(
        retryRequest?.headers?.[DEFAULT_AUTHORIZATION_HEADER_NAME]
      ).toMatch(`response="${digestResponse}"`);
      expect(
        cacheAndFetch.digest.getCached(
          hashDigestConfiguration(configuration, crypto),
          () => ''
        )
      ).toMatch(`response="${digestResponse}"`);
    });

    it('prepares digest auth without qop and algorithm for custom authorization header', async () => {
      const method = 'GET';
      const mockHeader = `Digest realm="${mockRealm}" nonce="${mockNonce}", opaque="${mockOpaque}"`;
      configuration.authorizationHeader = 'Custom';

      // Prepare digest response
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
            url: mockUrl + mockUri,
            headers: {},
            body: undefined,
          },
        },
      };
      const cacheAndFetch: IFetch & AuthCache = {
        ...fetchInstance,
      };
      mockInstance = new DigestHandler(configuration, cacheAndFetch, crypto);

      (mockInstance as any).makeNonce = () => mockCnonce;
      retryRequest = await mockInstance.handleResponse(response, parameters);

      expect(retryRequest?.headers?.Custom).toMatch(
        `response="${digestResponse}"`
      );
      expect(
        cacheAndFetch.digest.getCached(
          hashDigestConfiguration(configuration, crypto),
          () => ''
        )
      ).toMatch(`response="${digestResponse}"`);
    });

    it('prepares digest auth with auth-int qop', async () => {
      const qop = 'auth-int';
      const method = 'GET';

      const h1 = createHash('MD5')
        .update(`${username}:${mockRealm}:${password}`)
        .digest('hex');
      const h2 = createHash('MD5').update(`${method}:${mockUri}`).digest('hex');
      const digestResponse = createHash('MD5')
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
            url: mockUrl + mockUri,
            headers: {},
            body: undefined,
          },
        },
      };
      const cacheAndFetch: IFetch & AuthCache = {
        ...fetchInstance,
      };
      mockInstance = new DigestHandler(configuration, cacheAndFetch, crypto);

      (mockInstance as any).makeNonce = () => mockCnonce;
      retryRequest = await mockInstance.handleResponse(response, parameters);

      expect(
        retryRequest?.headers?.[DEFAULT_AUTHORIZATION_HEADER_NAME]
      ).toMatch(`response="${digestResponse}"`);
      expect(
        cacheAndFetch.digest.getCached(
          hashDigestConfiguration(configuration, crypto),
          () => ''
        )
      ).toMatch(`response="${digestResponse}"`);
    });

    it('prepares digest auth with default values and MD5', async () => {
      const qop = 'auth';
      const algorithm = 'MD5';
      const method = 'GET';

      const h1 = createHash(algorithm)
        .update(`${username}:${mockRealm}:${password}`)
        .digest('hex');
      const h2 = createHash(algorithm)
        .update(`${method}:${mockUri}`)
        .digest('hex');
      const digestResponse = createHash(algorithm)
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
            url: mockUrl + mockUri,
            headers: {},
            body: undefined,
          },
        },
      };

      const cacheAndFetch: IFetch & AuthCache = {
        ...fetchInstance,
      };
      mockInstance = new DigestHandler(configuration, cacheAndFetch, crypto);

      (mockInstance as any).makeNonce = () => mockCnonce;
      retryRequest = await mockInstance.handleResponse(response, parameters);

      expect(
        retryRequest?.headers?.[DEFAULT_AUTHORIZATION_HEADER_NAME]
      ).toMatch(`response="${digestResponse}"`);
      expect(
        cacheAndFetch.digest.getCached(
          hashDigestConfiguration(configuration, crypto),
          () => ''
        )
      ).toMatch(`response="${digestResponse}"`);
    });

    it('prepares digest auth with default values, custom headers and status code', async () => {
      const qop = 'auth';
      const algorithm = 'MD5';
      const method = 'GET';
      configuration.authorizationHeader = 'Auth';
      configuration.challengeHeader = 'Challenge';
      configuration.statusCode = 432;

      const h1 = createHash(algorithm)
        .update(`${username}:${mockRealm}:${password}`)
        .digest('hex');
      const h2 = createHash(algorithm)
        .update(`${method}:${mockUri}`)
        .digest('hex');
      const digestResponse = createHash(algorithm)
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
            url: mockUrl + mockUri,
            headers: {},
            body: undefined,
          },
        },
      };

      const cacheAndFetch: IFetch & AuthCache = {
        ...fetchInstance,
      };
      mockInstance = new DigestHandler(configuration, cacheAndFetch, crypto);
      (mockInstance as any).makeNonce = () => mockCnonce;
      retryRequest = await mockInstance.handleResponse(response, parameters);

      expect(retryRequest?.headers?.Auth).toMatch(
        `response="${digestResponse}"`
      );

      expect(
        cacheAndFetch.digest.getCached(
          hashDigestConfiguration(configuration, crypto),
          () => ''
        )
      ).toMatch(`response="${digestResponse}"`);
    });

    it('prepares digest auth with default values and MD5-sess', async () => {
      const qop = 'auth';
      const algorithm = 'MD5-sess';
      const method = 'GET';

      let h1 = createHash('MD5')
        .update(`${username}:${mockRealm}:${password}`)
        .digest('hex');
      h1 = createHash('MD5')
        .update(`${h1}:${mockNonce}:${mockCnonce}`)
        .digest('hex');
      const h2 = createHash('MD5').update(`${method}:${mockUri}`).digest('hex');
      const digestResponse = createHash('MD5')
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
            url: mockUrl + mockUri,
            headers: {},
            body: undefined,
          },
        },
      };
      const cacheAndFetch: IFetch & AuthCache = {
        ...fetchInstance,
      };
      mockInstance = new DigestHandler(configuration, cacheAndFetch, crypto);

      (mockInstance as any).makeNonce = () => mockCnonce;

      retryRequest = await mockInstance.handleResponse(response, parameters);

      expect(
        retryRequest?.headers?.[DEFAULT_AUTHORIZATION_HEADER_NAME]
      ).toMatch(`response="${digestResponse}"`);
      expect(
        cacheAndFetch.digest.getCached(
          hashDigestConfiguration(configuration, crypto),
          () => ''
        )
      ).toMatch(`response="${digestResponse}"`);
    });

    it('prepares digest auth with default values and SHA-256', async () => {
      const qop = 'auth';
      const algorithm = 'SHA-256';
      const method = 'GET';

      const h1 = createHash('sha256')
        .update(`${username}:${mockRealm}:${password}`)
        .digest('hex');
      const h2 = createHash('sha256')
        .update(`${method}:${mockUri}`)
        .digest('hex');
      const digestResponse = createHash('sha256')
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
            url: mockUrl + mockUri,
            headers: {},
            body: undefined,
          },
        },
      };

      const cacheAndFetch: IFetch & AuthCache = {
        ...fetchInstance,
      };
      mockInstance = new DigestHandler(configuration, cacheAndFetch, crypto);
      (mockInstance as any).makeNonce = () => mockCnonce;

      retryRequest = await mockInstance.handleResponse(response, parameters);

      expect(
        retryRequest?.headers?.[DEFAULT_AUTHORIZATION_HEADER_NAME]
      ).toMatch(`response="${digestResponse}"`);
      expect(
        cacheAndFetch.digest.getCached(
          hashDigestConfiguration(configuration, crypto),
          () => ''
        )
      ).toMatch(`response="${digestResponse}"`);
    });

    it('prepares digest auth with default values and SHA-256-sess', async () => {
      const qop = 'auth';
      const algorithm = 'SHA-256-sess';
      const method = 'GET';

      let h1 = createHash('sha256')
        .update(`${username}:${mockRealm}:${password}`)
        .digest('hex');
      h1 = createHash('sha256')
        .update(`${h1}:${mockNonce}:${mockCnonce}`)
        .digest('hex');
      const h2 = createHash('sha256')
        .update(`${method}:${mockUri}`)
        .digest('hex');
      const digestResponse = createHash('sha256')
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
            url: mockUrl + mockUri,
            headers: {},
            body: undefined,
          },
        },
      };

      const cacheAndFetch: IFetch & AuthCache = {
        ...fetchInstance,
      };
      mockInstance = new DigestHandler(configuration, cacheAndFetch, crypto);

      (mockInstance as any).makeNonce = () => mockCnonce;

      retryRequest = await mockInstance.handleResponse(response, parameters);

      expect(
        retryRequest?.headers?.[DEFAULT_AUTHORIZATION_HEADER_NAME]
      ).toMatch(`response="${digestResponse}"`);
      expect(
        cacheAndFetch.digest.getCached(
          hashDigestConfiguration(configuration, crypto),
          () => ''
        )
      ).toMatch(`response="${digestResponse}"`);
    });
  });
});
