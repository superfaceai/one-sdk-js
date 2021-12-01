import { createHash } from 'crypto';
import { mocked } from 'ts-jest/utils';

import { UnexpectedError } from '../../errors';
import { DigestHelper } from './digest';
import { FetchResponse } from './interfaces';

const mockFetch = jest.fn();

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

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('throws on unexpected status code', async () => {
    const qop = 'auth';
    const algorithm = 'MD5';
    const method = 'GET';
    const mockResponse: FetchResponse = {
      status: 409,
      statusText: 'Unathorized',
      headers: {
        'www-authenticate': `Digest realm="${mockRealm}", qop="${qop}", algorithm=${algorithm}, nonce="${mockNonce}", opaque="${mockOpaque}", cnonce="${mockCnonce}"`,
      },
      body: 'HTTP Digest: Access denied.\n',
    };
    mocked(mockFetch).mockResolvedValue(mockResponse);

    const mockInstance = new DigestHelper(mockUser, mockPassword, {
      fetch: mockFetch,
    });

    await expect(mockInstance.prepareAuth(mockUrl, method)).rejects.toEqual(
      new UnexpectedError(
        `Digest auth failed, server returned unexpected code ${mockResponse.status}`,
        mockResponse
      )
    );
  });

  it('throws on missing challenge header', async () => {
    const method = 'GET';
    const mockResponse: FetchResponse = {
      status: 401,
      statusText: 'Unathorized',
      headers: {},
      body: 'HTTP Digest: Access denied.\n',
    };
    mocked(mockFetch).mockResolvedValue(mockResponse);

    const mockInstance = new DigestHelper(mockUser, mockPassword, {
      fetch: mockFetch,
    });

    await expect(mockInstance.prepareAuth(mockUrl, method)).rejects.toEqual(
      new UnexpectedError(
        `Digest auth failed, unable to extract digest values from response. Header "www-authenticate" not found in response headers`,
        {}
      )
    );
  });

  it('throws on corrupted challenge header - missing scheme', async () => {
    const qop = 'auth';
    const algorithm = 'MD5';
    const method = 'GET';
    const mockResponse: FetchResponse = {
      status: 401,
      statusText: 'Unathorized',
      headers: {
        'www-authenticate': ` realm="${mockRealm}", qop="${qop}", algorithm=${algorithm}, nonce="${mockNonce}", opaque="${mockOpaque}"`,
      },
      body: 'HTTP Digest: Access denied.\n',
    };
    mocked(mockFetch).mockResolvedValue(mockResponse);

    const mockInstance = new DigestHelper(mockUser, mockPassword, {
      fetch: mockFetch,
    });

    await expect(mockInstance.prepareAuth(mockUrl, method)).rejects.toEqual(
      new UnexpectedError(
        `Digest auth failed, unable to extract digest values from response. Header "www-authenticate" does not contain scheme value eq. Digest`,
        mockResponse.headers['www-authenticate']
      )
    );
  });

  it('throws on corrupted challenge header - missing nonce', async () => {
    const qop = 'auth';
    const algorithm = 'MD5';
    const method = 'GET';
    const mockResponse: FetchResponse = {
      status: 401,
      statusText: 'Unathorized',
      headers: {
        'www-authenticate': `Digest realm="${mockRealm}", qop="${qop}", algorithm=${algorithm}, opaque="${mockOpaque}"`,
      },
      body: 'HTTP Digest: Access denied.\n',
    };
    mocked(mockFetch).mockResolvedValue(mockResponse);

    const mockInstance = new DigestHelper(mockUser, mockPassword, {
      fetch: mockFetch,
    });

    await expect(mockInstance.prepareAuth(mockUrl, method)).rejects.toEqual(
      new UnexpectedError(
        `Digest auth failed, unable to extract digest values from response. Header "www-authenticate" does not contain "nonce"`,
        mockResponse.headers['www-authenticate']
      )
    );
  });

  it('throws on unexpected algorithm', async () => {
    const algorithm = 'SOME_algorithm';
    const method = 'GET';
    const mockResponse: FetchResponse = {
      status: 401,
      statusText: 'Unathorized',
      headers: {
        'www-authenticate': `Digest realm="${mockRealm}", algorithm=${algorithm}, nonce="${mockNonce}", opaque="${mockOpaque}"`,
      },
      body: 'HTTP Digest: Access denied.\n',
    };
    mocked(mockFetch).mockResolvedValue(mockResponse);

    const mockInstance = new DigestHelper(mockUser, mockPassword, {
      fetch: mockFetch,
    });
    await expect(mockInstance.prepareAuth(mockUrl, method)).rejects.toEqual(
      new UnexpectedError(
        `Digest auth failed, parameter "algorithm" has unexpected value`,
        algorithm
      )
    );
  });

  it('throws on unexpected qop', async () => {
    const qop = 'some_qop';
    const method = 'GET';
    const mockResponse: FetchResponse = {
      status: 401,
      statusText: 'Unathorized',
      headers: {
        'www-authenticate': `Digest realm="${mockRealm}", qop="${qop}", nonce="${mockNonce}", opaque="${mockOpaque}"`,
      },
      body: 'HTTP Digest: Access denied.\n',
    };
    mocked(mockFetch).mockResolvedValue(mockResponse);

    const mockInstance = new DigestHelper(mockUser, mockPassword, {
      fetch: mockFetch,
    });
    await expect(mockInstance.prepareAuth(mockUrl, method)).rejects.toEqual(
      new UnexpectedError(
        `Digest auth failed, parameter "quality of protection" has unexpected value`,
        qop
      )
    );
  });

  it('prepares digest auth without qop and algorithm', async () => {
    const method = 'GET';
    const mockResponse: FetchResponse = {
      status: 401,
      statusText: 'Unathorized',
      headers: {
        'www-authenticate': `Digest realm="${mockRealm}" nonce="${mockNonce}", opaque="${mockOpaque}"`,
      },
      body: 'HTTP Digest: Access denied.\n',
    };
    mocked(mockFetch).mockResolvedValue(mockResponse);

    const mockInstance = new DigestHelper(mockUser, mockPassword, {
      fetch: mockFetch,
    });
    (mockInstance as any).makeNonce = () => mockCnonce;

    const h1 = createHash('MD5')
      .update(`${mockUser}:${mockRealm}:${mockPassword}`)
      .digest('hex');
    const h2 = createHash('MD5').update(`${method}:${mockUri}`).digest('hex');
    const expectedResponse = createHash('MD5')
      .update(`${h1}:${mockNonce}:${h2}`)
      .digest('hex');

    await expect(mockInstance.prepareAuth(mockUrl, method)).resolves.toEqual(
      `Digest username="${mockUser}",realm="${mockRealm}",nonce="${mockNonce}",uri="${mockUri}",opaque="${mockOpaque}",algorithm="MD5",response="${expectedResponse}",nc=00000001,cnonce="${mockCnonce}"`
    );
  });

  it('prepares digest auth with auth-int qop', async () => {
    const qop = 'auth-int';
    const method = 'GET';
    const mockResponse: FetchResponse = {
      status: 401,
      statusText: 'Unathorized',
      headers: {
        'www-authenticate': `Digest realm="${mockRealm}", qop="${qop}", nonce="${mockNonce}", opaque="${mockOpaque}"`,
      },
      body: 'HTTP Digest: Access denied.\n',
    };
    mocked(mockFetch).mockResolvedValue(mockResponse);

    const mockInstance = new DigestHelper(mockUser, mockPassword, {
      fetch: mockFetch,
    });
    (mockInstance as any).makeNonce = () => mockCnonce;

    const h1 = createHash('MD5')
      .update(`${mockUser}:${mockRealm}:${mockPassword}`)
      .digest('hex');
    const h2 = createHash('MD5').update(`${method}:${mockUri}`).digest('hex');
    const expectedResponse = createHash('MD5')
      .update(`${h1}:${mockNonce}:00000001:${mockCnonce}:${qop}:${h2}`)
      .digest('hex');

    await expect(mockInstance.prepareAuth(mockUrl, method)).resolves.toEqual(
      `Digest username="${mockUser}",realm="${mockRealm}",nonce="${mockNonce}",uri="${mockUri}",opaque="${mockOpaque}",qop="${qop}",algorithm="MD5",response="${expectedResponse}",nc=00000001,cnonce="${mockCnonce}"`
    );
  });

  it('prepares digest auth with default values and MD5', async () => {
    const qop = 'auth';
    const algorithm = 'MD5';
    const method = 'GET';
    const mockResponse: FetchResponse = {
      status: 401,
      statusText: 'Unathorized',
      headers: {
        'www-authenticate': `Digest realm="${mockRealm}", qop="${qop}", algorithm=${algorithm}, nonce="${mockNonce}", opaque="${mockOpaque}"`,
      },
      body: 'HTTP Digest: Access denied.\n',
    };
    mocked(mockFetch).mockResolvedValue(mockResponse);

    const mockInstance = new DigestHelper(mockUser, mockPassword, {
      fetch: mockFetch,
    });
    (mockInstance as any).makeNonce = () => mockCnonce;

    const h1 = createHash(algorithm)
      .update(`${mockUser}:${mockRealm}:${mockPassword}`)
      .digest('hex');
    const h2 = createHash(algorithm)
      .update(`${method}:${mockUri}`)
      .digest('hex');
    const expectedResponse = createHash(algorithm)
      .update(`${h1}:${mockNonce}:00000001:${mockCnonce}:${qop}:${h2}`)
      .digest('hex');

    await expect(mockInstance.prepareAuth(mockUrl, method)).resolves.toEqual(
      `Digest username="${mockUser}",realm="${mockRealm}",nonce="${mockNonce}",uri="${mockUri}",opaque="${mockOpaque}",qop="${qop}",algorithm="${algorithm}",response="${expectedResponse}",nc=00000001,cnonce="${mockCnonce}"`
    );
  });

  it('prepares digest auth with default values and MD5-sess', async () => {
    const qop = 'auth';
    const algorithm = 'MD5-sess';
    const method = 'GET';
    const mockResponse: FetchResponse = {
      status: 401,
      statusText: 'Unathorized',
      headers: {
        'www-authenticate': `Digest realm="${mockRealm}", qop="${qop}", algorithm=${algorithm}, nonce="${mockNonce}", opaque="${mockOpaque}"`,
      },
      body: 'HTTP Digest: Access denied.\n',
    };
    mocked(mockFetch).mockResolvedValue(mockResponse);

    const mockInstance = new DigestHelper(mockUser, mockPassword, {
      fetch: mockFetch,
    });
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

    await expect(mockInstance.prepareAuth(mockUrl, method)).resolves.toEqual(
      `Digest username="${mockUser}",realm="${mockRealm}",nonce="${mockNonce}",uri="${mockUri}",opaque="${mockOpaque}",qop="${qop}",algorithm="${algorithm}",response="${expectedResponse}",nc=00000001,cnonce="${mockCnonce}"`
    );
  });

  it('prepares digest auth with default values and SHA-256', async () => {
    const qop = 'auth';
    const algorithm = 'SHA-256';
    const method = 'GET';
    const mockResponse: FetchResponse = {
      status: 401,
      statusText: 'Unathorized',
      headers: {
        'www-authenticate': `Digest realm="${mockRealm}", qop="${qop}", algorithm=${algorithm}, nonce="${mockNonce}", opaque="${mockOpaque}"`,
      },
      body: 'HTTP Digest: Access denied.\n',
    };
    mocked(mockFetch).mockResolvedValue(mockResponse);

    const mockInstance = new DigestHelper(mockUser, mockPassword, {
      fetch: mockFetch,
    });
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

    await expect(mockInstance.prepareAuth(mockUrl, method)).resolves.toEqual(
      `Digest username="${mockUser}",realm="${mockRealm}",nonce="${mockNonce}",uri="${mockUri}",opaque="${mockOpaque}",qop="${qop}",algorithm="${algorithm}",response="${expectedResponse}",nc=00000001,cnonce="${mockCnonce}"`
    );
  });

  it('prepares digest auth with default values and SHA-256-sess', async () => {
    const qop = 'auth';
    const algorithm = 'SHA-256-sess';
    const method = 'GET';
    const mockResponse: FetchResponse = {
      status: 401,
      statusText: 'Unathorized',
      headers: {
        'www-authenticate': `Digest realm="${mockRealm}", qop="${qop}", algorithm=${algorithm}, nonce="${mockNonce}", opaque="${mockOpaque}"`,
      },
      body: 'HTTP Digest: Access denied.\n',
    };
    mocked(mockFetch).mockResolvedValue(mockResponse);

    const mockInstance = new DigestHelper(mockUser, mockPassword, {
      fetch: mockFetch,
    });
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

    await expect(mockInstance.prepareAuth(mockUrl, method)).resolves.toEqual(
      `Digest username="${mockUser}",realm="${mockRealm}",nonce="${mockNonce}",uri="${mockUri}",opaque="${mockOpaque}",qop="${qop}",algorithm="${algorithm}",response="${expectedResponse}",nc=00000001,cnonce="${mockCnonce}"`
    );
  });
});
