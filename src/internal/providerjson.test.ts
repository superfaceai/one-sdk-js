import { ZodError } from 'zod';

import {
  ApiKeyPlacement,
  HttpScheme,
  isApiKeySecurityScheme,
  isBasicAuthSecurityScheme,
  isBearerTokenSecurityScheme,
  isDigestSecurityScheme,
  parseProviderJson,
  SecurityType,
} from './providerjson';

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
          isApiKeySecurityScheme({
            id: 'swapidev',
            type: SecurityType.APIKEY,
            in: ApiKeyPlacement.HEADER,
            name: 'X-API-Key',
          })
        ).toEqual(true);
      }
      {
        expect(
          isApiKeySecurityScheme({
            id: 'swapidev',
            type: SecurityType.APIKEY,
            in: ApiKeyPlacement.BODY,
            name: 'X-API-Key',
          })
        ).toEqual(true);
      }
      {
        expect(
          isApiKeySecurityScheme({
            id: 'swapidev',
            type: SecurityType.APIKEY,
            in: ApiKeyPlacement.PATH,
            name: 'X-API-Key',
          })
        ).toEqual(true);
      }
      {
        expect(
          isApiKeySecurityScheme({
            id: 'swapidev',
            type: SecurityType.APIKEY,
            in: ApiKeyPlacement.QUERY,
            name: 'X-API-Key',
          })
        ).toEqual(true);
      }
      {
        expect(
          isApiKeySecurityScheme({
            id: 'swapidev',
            type: SecurityType.HTTP,
            scheme: HttpScheme.BEARER,
          })
        ).toEqual(false);
      }
      {
        expect(
          isApiKeySecurityScheme({
            id: 'swapidev',
            type: SecurityType.HTTP,
            scheme: HttpScheme.BASIC,
          })
        ).toEqual(false);
      }
      {
        expect(
          isApiKeySecurityScheme({
            id: 'swapidev',
            type: SecurityType.HTTP,
            scheme: HttpScheme.DIGEST,
          })
        ).toEqual(false);
      }
    });

    it('checks BasicAuthSecurity type correctly', () => {
      {
        expect(
          isBasicAuthSecurityScheme({
            id: 'swapidev',
            type: SecurityType.APIKEY,
            in: ApiKeyPlacement.HEADER,
            name: 'X-API-Key',
          })
        ).toEqual(false);
      }
      {
        expect(
          isBasicAuthSecurityScheme({
            id: 'swapidev',
            type: SecurityType.HTTP,
            scheme: HttpScheme.BEARER,
          })
        ).toEqual(false);
      }
      {
        expect(
          isBasicAuthSecurityScheme({
            id: 'swapidev',
            type: SecurityType.HTTP,
            scheme: HttpScheme.BASIC,
          })
        ).toEqual(true);
      }
      {
        expect(
          isBasicAuthSecurityScheme({
            id: 'swapidev',
            type: SecurityType.HTTP,
            scheme: HttpScheme.DIGEST,
          })
        ).toEqual(false);
      }
    });

    it('checks BearerTokenSecurity type correctly', () => {
      {
        expect(
          isBearerTokenSecurityScheme({
            id: 'swapidev',
            type: SecurityType.APIKEY,
            in: ApiKeyPlacement.HEADER,
            name: 'X-API-Key',
          })
        ).toEqual(false);
      }
      {
        expect(
          isBearerTokenSecurityScheme({
            id: 'swapidev',
            type: SecurityType.HTTP,
            scheme: HttpScheme.BEARER,
          })
        ).toEqual(true);
      }
      {
        expect(
          isBearerTokenSecurityScheme({
            id: 'swapidev',
            type: SecurityType.HTTP,
            scheme: HttpScheme.BASIC,
          })
        ).toEqual(false);
      }
      {
        expect(
          isBearerTokenSecurityScheme({
            id: 'swapidev',
            type: SecurityType.HTTP,
            scheme: HttpScheme.DIGEST,
          })
        ).toEqual(false);
      }
    });

    it('checks DigestAuthSecurity type correctly', () => {
      {
        expect(
          isDigestSecurityScheme({
            id: 'swapidev',
            type: SecurityType.APIKEY,
            in: ApiKeyPlacement.HEADER,
            name: 'X-API-Key',
          })
        ).toEqual(false);
      }
      {
        expect(
          isDigestSecurityScheme({
            id: 'swapidev',
            type: SecurityType.HTTP,
            scheme: HttpScheme.BEARER,
          })
        ).toEqual(false);
      }
      {
        expect(
          isDigestSecurityScheme({
            id: 'swapidev',
            type: SecurityType.HTTP,
            scheme: HttpScheme.BASIC,
          })
        ).toEqual(false);
      }
      {
        expect(
          isDigestSecurityScheme({
            id: 'swapidev',
            type: SecurityType.HTTP,
            scheme: HttpScheme.DIGEST,
          })
        ).toEqual(true);
      }
    });
  });
});
