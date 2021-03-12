import { ZodError } from 'zod';

import {
  API_KEY_AUTH_SECURITY_TYPE,
  ApiKeySecurityIn,
  BASIC_AUTH_SECURITY_SCHEME,
  BEARER_AUTH_SECURITY_SCHEME,
  HTTP_AUTH_SECURITY_TYPE,
  isApiKeySecurity,
  isBasicAuthSecurity,
  isBearerTokenSecurity,
  parseProviderJson,
} from '.';
import { isDigestAuthSecurity, DIGEST_AUTH_SECURITY_SCHEME } from './providerjson';

describe('ProviderJsonDocument', () => {
  it('parses valid provider.json', () => {
    {
      const providerJson = `{
        "name": "swapidev",
        "services": [
            {
                "baseUrl": "https://swapi.dev/api",
                "id": "swapidev"
            }
        ],
        "securitySchemes": [
            {
                "id": "swapidev",
                "type": "http",
                "scheme": "bearer"
            },
            {
                "id": "swapidev",
                "type": "apiKey",
                "in": "header",
                "name": "X-API-Key"
            },
            {
                "id": "swapidev",
                "type": "http",
                "scheme": "basic"
            }
        ],
        "defaultService": "swapidev"
      }`;
      expect(parseProviderJson(JSON.parse(providerJson))).toEqual({
        name: 'swapidev',
        services: [
          {
            id: 'swapidev',
            baseUrl: 'https://swapi.dev/api',
          },
        ],
        securitySchemes: [
          {
            id: 'swapidev',
            type: 'http',
            scheme: 'bearer',
          },
          {
            id: 'swapidev',
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key',
          },
          {
            id: 'swapidev',
            type: 'http',
            scheme: 'basic',
          },
        ],
        defaultService: 'swapidev',
      });
    }
    {
      const providerJson = `{
        "name": "swapidev",
        "services": [
            {
                "baseUrl": "https://swapi.dev/api",
                "id": "swapidev"
            }
        ],
        "securitySchemes": [],
        "defaultService": "swapidev"
      }`;
      expect(parseProviderJson(JSON.parse(providerJson))).toEqual({
        name: 'swapidev',
        services: [
          {
            id: 'swapidev',
            baseUrl: 'https://swapi.dev/api',
          },
        ],
        securitySchemes: [],
        defaultService: 'swapidev',
      });
    }
    {
      const providerJson = `{
        "name": "swapidev",
        "services": [
            {
                "baseUrl": "https://swapi.dev/api",
                "id": "swapidev"
            }
        ],
        "defaultService": "swapidev"
      }`;
      expect(parseProviderJson(JSON.parse(providerJson))).toEqual({
        name: 'swapidev',
        services: [
          {
            id: 'swapidev',
            baseUrl: 'https://swapi.dev/api',
          },
        ],
        defaultService: 'swapidev',
      });
    }

    {
      const providerJson = `{
        "name": "swapidev",
        "services": [
            {
                "baseUrl": "https://swapi.dev/api",
                "id": "swapidev"
            }
        ],
        "securitySchemes": [
            {
                "id": "swapidev",
                "type": "apiKey",
                "in": "header"
            }
        ],
        "defaultService": "swapidev"
      }`;
      expect(parseProviderJson(JSON.parse(providerJson))).toEqual({
        name: 'swapidev',
        services: [
          {
            id: 'swapidev',
            baseUrl: 'https://swapi.dev/api',
          },
        ],
        securitySchemes: [
          {
            id: 'swapidev',
            type: 'apiKey',
            in: 'header',
            //Name has a default value
            name: 'Authorization',
          },
        ],
        defaultService: 'swapidev',
      });
    }
  });

  it('throws error on document with missing name', () => {
    const providerJson = `{
        "services": [
            {
                "baseUrl": "https://swapi.dev/api",
                "id": "swapidev"
            }
        ],
        "defaultService": "swapidev"
      }`;
    expect(() => {
      parseProviderJson(JSON.parse(providerJson));
    }).toThrowError(
      new ZodError([
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'undefined',
          path: ['name'],
          message: 'Required',
        },
      ])
    );
  });

  it('throws error on document with missing services', () => {
    const providerJson = `{
        "name": "swapidev",
        "defaultService": "swapidev"
      }`;
    expect(() => {
      parseProviderJson(JSON.parse(providerJson));
    }).toThrowError(
      new ZodError([
        {
          code: 'invalid_type',
          expected: 'array',
          received: 'undefined',
          path: ['services'],
          message: 'Required',
        },
      ])
    );
  });

  it('throws error on document with missing property in services', () => {
    const providerJson = `{
        "name": "swapidev",
        "services": [
          {
              "id": "swapidev"
          }
        ],
        "defaultService": "swapidev"
      }`;
    expect(() => {
      parseProviderJson(JSON.parse(providerJson));
    }).toThrowError(
      new ZodError([
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'undefined',
          path: ['services', 0, 'baseUrl'],
          message: 'Required',
        },
      ])
    );
  });

  it('throws error on document with missing defaultService', () => {
    const providerJson = `{
        "name": "swapidev",
        "services": [
          {
              "baseUrl": "https://swapi.dev/api",
              "id": "swapidev"
          }
        ]
      }`;
    expect(() => {
      parseProviderJson(JSON.parse(providerJson));
    }).toThrowError(
      new ZodError([
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'undefined',
          path: ['defaultService'],
          message: 'Required',
        },
      ])
    );
  });

  it('throws error on document with missing id property in securitySchemes', () => {
    const providerJson = `{"name": "swapidev",
      "services": [
          {
              "baseUrl": "https://swapi.dev/api",
              "id": "swapidev"
          }
      ],
      "securitySchemes": [
          {
              "type": "http",
              "scheme": "bearer"
          }
      ],
      "defaultService": "swapidev"
    }`;
    expect(() => {
      parseProviderJson(JSON.parse(providerJson));
    }).toThrow();
  });

  it('throws error on document with missing type property in securitySchemes', () => {
    const providerJson = `{"name": "swapidev",
      "services": [
          {
              "baseUrl": "https://swapi.dev/api",
              "id": "swapidev"
          }
      ],
      "securitySchemes": [
          {
              "id": "swapidev",
              "scheme": "bearer"
          }
      ],
      "defaultService": "swapidev"
    }`;
    expect(() => {
      parseProviderJson(JSON.parse(providerJson));
    }).toThrow();
  });

  it('throws error on document with missing scheme property in securitySchemes', () => {
    const providerJson = `{"name": "swapidev",
      "services": [
          {
              "baseUrl": "https://swapi.dev/api",
              "id": "swapidev"
          }
      ],
      "securitySchemes": [
          {
              "id": "swapidev",
              "type": "http"
          }
      ],
      "defaultService": "swapidev"
    }`;
    expect(() => {
      parseProviderJson(JSON.parse(providerJson));
    }).toThrow();
  });

  it('throws error on document with missing in property in securitySchemes', () => {
    const providerJson = `{"name": "swapidev",
      "services": [
          {
              "baseUrl": "https://swapi.dev/api",
              "id": "swapidev"
          }
      ],
      "securitySchemes": [
          {
            "id": "swapidev",
            "type": "apiKey",
            "name": "X-API-Key"
          }
      ],
      "defaultService": "swapidev"
    }`;
    expect(() => {
      parseProviderJson(JSON.parse(providerJson));
    }).toThrow();
  });

  describe('ProviderJson type guards', () => {
    it('checks ApiTokenSecurity type correctly', () => {
      {
        expect(
          isApiKeySecurity({
            id: 'swapidev',
            type: API_KEY_AUTH_SECURITY_TYPE,
            in: ApiKeySecurityIn.HEADER,
            name: 'X-API-Key',
          })
        ).toEqual(true);
      }
      {
        expect(
          isApiKeySecurity({
            id: 'swapidev',
            type: API_KEY_AUTH_SECURITY_TYPE,
            in: ApiKeySecurityIn.BODY,
            name: 'X-API-Key',
          })
        ).toEqual(true);
      }
      {
        expect(
          isApiKeySecurity({
            id: 'swapidev',
            type: API_KEY_AUTH_SECURITY_TYPE,
            in: ApiKeySecurityIn.PATH,
            name: 'X-API-Key',
          })
        ).toEqual(true);
      }
      {
        expect(
          isApiKeySecurity({
            id: 'swapidev',
            type: API_KEY_AUTH_SECURITY_TYPE,
            in: ApiKeySecurityIn.QUERY,
            name: 'X-API-Key',
          })
        ).toEqual(true);
      }
      {
        expect(
          isApiKeySecurity({
            id: 'swapidev',
            type: HTTP_AUTH_SECURITY_TYPE,
            scheme: BEARER_AUTH_SECURITY_SCHEME,
          })
        ).toEqual(false);
      }
      {
        expect(
          isApiKeySecurity({
            id: 'swapidev',
            type: HTTP_AUTH_SECURITY_TYPE,
            scheme: BASIC_AUTH_SECURITY_SCHEME,
          })
        ).toEqual(false);
      }
      {
        expect(
          isApiKeySecurity({
            id: 'swapidev',
            type: HTTP_AUTH_SECURITY_TYPE,
            scheme: DIGEST_AUTH_SECURITY_SCHEME,
          })
        ).toEqual(false);
      }
    });

    it('checks BasicAuthSecurity type correctly', () => {
      {
        expect(
          isBasicAuthSecurity({
            id: 'swapidev',
            type: API_KEY_AUTH_SECURITY_TYPE,
            in: ApiKeySecurityIn.HEADER,
            name: 'X-API-Key',
          })
        ).toEqual(false);
      }
      {
        expect(
          isBasicAuthSecurity({
            id: 'swapidev',
            type: HTTP_AUTH_SECURITY_TYPE,
            scheme: BEARER_AUTH_SECURITY_SCHEME,
          })
        ).toEqual(false);
      }
      {
        expect(
          isBasicAuthSecurity({
            id: 'swapidev',
            type: HTTP_AUTH_SECURITY_TYPE,
            scheme: BASIC_AUTH_SECURITY_SCHEME,
          })
        ).toEqual(true);
      }
      {
        expect(
          isBasicAuthSecurity({
            id: 'swapidev',
            type: HTTP_AUTH_SECURITY_TYPE,
            scheme: DIGEST_AUTH_SECURITY_SCHEME,
          })
        ).toEqual(false);
      }
    });

    it('checks BearerTokenSecurity type correctly', () => {
      {
        expect(
          isBearerTokenSecurity({
            id: 'swapidev',
            type: API_KEY_AUTH_SECURITY_TYPE,
            in: ApiKeySecurityIn.HEADER,
            name: 'X-API-Key',
          })
        ).toEqual(false);
      }
      {
        expect(
          isBearerTokenSecurity({
            id: 'swapidev',
            type: HTTP_AUTH_SECURITY_TYPE,
            scheme: BEARER_AUTH_SECURITY_SCHEME,
          })
        ).toEqual(true);
      }
      {
        expect(
          isBearerTokenSecurity({
            id: 'swapidev',
            type: HTTP_AUTH_SECURITY_TYPE,
            scheme: BASIC_AUTH_SECURITY_SCHEME,
          })
        ).toEqual(false);
      }
      {
        expect(
          isBearerTokenSecurity({
            id: 'swapidev',
            type: HTTP_AUTH_SECURITY_TYPE,
            scheme: DIGEST_AUTH_SECURITY_SCHEME,
          })
        ).toEqual(false);
      }
    });

    it('checks DigestAuthSecurity type correctly', () => {
      {
        expect(
          isDigestAuthSecurity({
            id: 'swapidev',
            type: API_KEY_AUTH_SECURITY_TYPE,
            in: ApiKeySecurityIn.HEADER,
            name: 'X-API-Key',
          })
        ).toEqual(false);
      }
      {
        expect(
          isDigestAuthSecurity({
            id: 'swapidev',
            type: HTTP_AUTH_SECURITY_TYPE,
            scheme: BEARER_AUTH_SECURITY_SCHEME,
          })
        ).toEqual(false);
      }
      {
        expect(
          isDigestAuthSecurity({
            id: 'swapidev',
            type: HTTP_AUTH_SECURITY_TYPE,
            scheme: BASIC_AUTH_SECURITY_SCHEME,
          })
        ).toEqual(false);
      }
      {
        expect(
          isDigestAuthSecurity({
            id: 'swapidev',
            type: HTTP_AUTH_SECURITY_TYPE,
            scheme: DIGEST_AUTH_SECURITY_SCHEME,
          })
        ).toEqual(true);
      }
    });
  });
});
