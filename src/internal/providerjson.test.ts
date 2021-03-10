import { ZodError } from 'zod';

import { parseProviderJson } from '.';

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
});
