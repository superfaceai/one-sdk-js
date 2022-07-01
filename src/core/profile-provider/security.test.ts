import {
  ApiKeyPlacement,
  HttpScheme,
  SecurityScheme,
  SecurityType,
  SecurityValues,
} from '@superfaceai/ast';

import { invalidSecurityValuesError, securityNotFoundError } from '../errors';
import { resolveSecurityConfiguration } from './security';

describe('resolveSecurityConfiguration', () => {
  it('throws error when could not find scheme', async () => {
    const securityValue: SecurityValues = {
      username: 'test-username',
      id: 'made-up-id',
      password: 'test-password',
    };

    const securityScheme: SecurityScheme = {
      id: 'basic',
      type: SecurityType.HTTP,
      scheme: HttpScheme.BASIC,
    };

    expect(() =>
      resolveSecurityConfiguration([securityScheme], [securityValue], 'test')
    ).toThrow(securityNotFoundError('test', ['basic'], securityValue));
  });

  it('throws error on invalid api key scheme', async () => {
    const securityValue: SecurityValues = {
      id: 'apiKey',
      password: 'test-password',
    } as SecurityValues;

    const securityScheme: SecurityScheme = {
      id: 'apiKey',
      in: ApiKeyPlacement.BODY,
      type: SecurityType.APIKEY,
    };

    expect(() =>
      resolveSecurityConfiguration([securityScheme], [securityValue], 'test')
    ).toThrow(
      invalidSecurityValuesError(
        'test',
        'apiKey',
        'apiKey',
        ['password'],
        ['apikey']
      )
    );
  });

  it('throws error on invalid basic auth scheme', async () => {
    const securityValue: SecurityValues = {
      id: 'basic',
      password: 'test-password',
    } as SecurityValues;

    const securityScheme: SecurityScheme = {
      id: 'basic',
      type: SecurityType.HTTP,
      scheme: HttpScheme.BASIC,
    };

    expect(() =>
      resolveSecurityConfiguration([securityScheme], [securityValue], 'test')
    ).toThrow(
      invalidSecurityValuesError(
        'test',
        'http',
        'basic',
        ['password'],
        ['username', 'password']
      )
    );
  });

  it('throws error on invalid bearer auth scheme', async () => {
    const securityValue: SecurityValues = {
      id: 'basic',
      password: 'test-password',
    } as SecurityValues;

    const securityScheme: SecurityScheme = {
      id: 'basic',
      type: SecurityType.HTTP,
      scheme: HttpScheme.BEARER,
      bearerFormat: 'test',
    };

    expect(() =>
      resolveSecurityConfiguration([securityScheme], [securityValue], 'test')
    ).toThrow(
      invalidSecurityValuesError(
        'test',
        'http',
        'basic',
        ['password'],
        ['token']
      )
    );
  });

  it('throws error on invalid digest auth scheme', async () => {
    const securityValue: SecurityValues = {
      id: 'basic',
      password: 'test-password',
    } as SecurityValues;

    const securityScheme: SecurityScheme = {
      id: 'basic',
      type: SecurityType.HTTP,
      scheme: HttpScheme.DIGEST,
    };

    expect(() =>
      resolveSecurityConfiguration([securityScheme], [securityValue], 'test')
    ).toThrow(
      invalidSecurityValuesError(
        'test',
        'http',
        'basic',
        ['password'],
        ['digest']
      )
    );
  });

  it('resolves security configuration', async () => {
    const securityValues: SecurityValues[] = [
      {
        id: 'basic',
        password: 'test-password',
        username: 'test',
      },
      {
        id: 'apiKey',
        apikey: 'key',
      },
      {
        id: 'bearer',
        token: 'token',
      },
      {
        id: 'digest',
        password: 'test-password',
        username: 'test',
      },
    ];

    const securitySchemes: SecurityScheme[] = [
      {
        id: 'digest',
        type: SecurityType.HTTP,
        scheme: HttpScheme.DIGEST,
      },
      {
        id: 'basic',
        type: SecurityType.HTTP,
        scheme: HttpScheme.BASIC,
      },
      {
        id: 'bearer',
        type: SecurityType.HTTP,
        scheme: HttpScheme.BEARER,
      },
      {
        id: 'apiKey',
        type: SecurityType.APIKEY,
        in: ApiKeyPlacement.BODY,
      },
    ];

    expect(
      resolveSecurityConfiguration(securitySchemes, securityValues, 'test')
    ).toEqual([
      {
        id: 'basic',
        password: 'test-password',
        username: 'test',
        type: SecurityType.HTTP,
        scheme: HttpScheme.BASIC,
      },
      {
        id: 'apiKey',
        apikey: 'key',
        type: SecurityType.APIKEY,
        in: ApiKeyPlacement.BODY,
      },
      {
        id: 'bearer',
        token: 'token',
        type: SecurityType.HTTP,
        scheme: HttpScheme.BEARER,
      },
      {
        id: 'digest',
        password: 'test-password',
        username: 'test',
        type: SecurityType.HTTP,
        scheme: HttpScheme.DIGEST,
      },
    ]);
  });
});
