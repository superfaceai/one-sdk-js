import { createHash } from 'crypto';

import { UnexpectedError } from '../../../errors';
import { HttpResponse } from '../http';
import { DigestHelper } from './digest';

describe('DigestHelper', () => {
  const mockUser = 'test-user';
  const mockPassword = 'test-password';
  const mockUri = '/pms_api/91508/121/bookings/10619';
  const mockUrl = 'https://sky-eu1.clock-software.com' + mockUri;
  const mockRealm = 'API';
  const mockNonce =
    'MTYzODM0OTE4Nzo0YTdlODlmYjI3ODZiZGZhNDhiODAwM2NmNjIwMzE2OQ==';
  const mockCnonce = '9e3355cb6a75d66ce7eea7fc7fc8526d';
  const mockOpaque = 'b816d4d26130bed8ccf5149e855000ad';
  let mockInstance: DigestHelper;

  beforeEach(() => {
    mockInstance = new DigestHelper(mockUser, mockPassword);
  });
  afterEach(() => {
    jest.resetAllMocks();
  });
  describe('extractCredentials', () => {
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

      expect(
        mockInstance.extractCredentials(response, mockUrl, method)
      ).toBeUndefined();
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
        mockInstance.extractCredentials(response, mockUrl, method)
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
        mockInstance.extractCredentials(response, mockUrl, method)
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
        mockInstance.extractCredentials(response, mockUrl, method)
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
        mockInstance.extractCredentials(response, mockUrl, method)
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
        mockInstance.extractCredentials(response, mockUrl, method)
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
      //Prepare digest response
      const h1 = createHash('MD5')
        .update(`${mockUser}:${mockRealm}:${mockPassword}`)
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

      expect(
        mockInstance.extractCredentials(response, mockUrl, method)
      ).toEqual(expect.stringContaining(`response="${digestResponse}"`));
    });

    it('prepares digest auth with auth-int qop', async () => {
      const qop = 'auth-int';
      const method = 'GET';

      const h1 = createHash('MD5')
        .update(`${mockUser}:${mockRealm}:${mockPassword}`)
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

      expect(
        mockInstance.extractCredentials(response, mockUrl, method)
      ).toEqual(expect.stringContaining(`response="${expectedResponse}"`));
    });

    it('prepares digest auth with default values and MD5', async () => {
      const qop = 'auth';
      const algorithm = 'MD5';
      const method = 'GET';

      const h1 = createHash(algorithm)
        .update(`${mockUser}:${mockRealm}:${mockPassword}`)
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

      expect(
        mockInstance.extractCredentials(response, mockUrl, method)
      ).toEqual(expect.stringContaining(`response="${expectedResponse}"`));
    });

    it('prepares digest auth with default values and MD5-sess', async () => {
      const qop = 'auth';
      const algorithm = 'MD5-sess';
      const method = 'GET';

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

      let h1 = createHash('MD5')
        .update(`${mockUser}:${mockRealm}:${mockPassword}`)
        .digest('hex');
      h1 = createHash('MD5')
        .update(`${h1}:${mockNonce}:${mockCnonce}`)
        .digest('hex');
      const h2 = createHash('MD5').update(`${method}:${mockUri}`).digest('hex');
      const expectedResponse = createHash('MD5')
        .update(`${h1}:${mockNonce}:00000001:${mockCnonce}:${qop}:${h2}`)
        .digest('hex');

      expect(
        mockInstance.extractCredentials(response, mockUrl, method)
      ).toEqual(expect.stringContaining(`response="${expectedResponse}"`));
    });

    it('prepares digest auth with default values and SHA-256', async () => {
      const qop = 'auth';
      const algorithm = 'SHA-256';
      const method = 'GET';

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

      const h1 = createHash('sha256')
        .update(`${mockUser}:${mockRealm}:${mockPassword}`)
        .digest('hex');
      const h2 = createHash('sha256')
        .update(`${method}:${mockUri}`)
        .digest('hex');
      const expectedResponse = createHash('sha256')
        .update(`${h1}:${mockNonce}:00000001:${mockCnonce}:${qop}:${h2}`)
        .digest('hex');

      expect(
        mockInstance.extractCredentials(response, mockUrl, method)
      ).toEqual(expect.stringContaining(`response="${expectedResponse}"`));
    });

    it('prepares digest auth with default values and SHA-256-sess', async () => {
      const qop = 'auth';
      const algorithm = 'SHA-256-sess';
      const method = 'GET';

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

      let h1 = createHash('sha256')
        .update(`${mockUser}:${mockRealm}:${mockPassword}`)
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

      expect(
        mockInstance.extractCredentials(response, mockUrl, method)
      ).toEqual(expect.stringContaining(`response="${expectedResponse}"`));
    });
  });
});
