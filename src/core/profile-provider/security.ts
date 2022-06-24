import {
  HttpScheme,
  isApiKeySecurityValues,
  isBasicAuthSecurityValues,
  isBearerTokenSecurityValues,
  isDigestSecurityValues,
  SecurityScheme,
  SecurityType,
  SecurityValues,
} from '@superfaceai/ast';

import {
  invalidSecurityValuesError,
  SecurityConfiguration,
  securityNotFoundError,
} from '~core';

export function resolveSecurityConfiguration(
  schemes: SecurityScheme[],
  values: SecurityValues[],
  providerName: string
): SecurityConfiguration[] {
  const result: SecurityConfiguration[] = [];

  for (const vals of values) {
    const scheme = schemes.find(scheme => scheme.id === vals.id);
    if (scheme === undefined) {
      const definedSchemes = schemes.map(s => s.id);
      throw securityNotFoundError(providerName, definedSchemes, vals);
    }

    const invalidSchemeValuesErrorBuilder = (
      scheme: SecurityScheme,
      values: SecurityValues,
      requiredKeys: [string, ...string[]]
    ) => {
      const valueKeys = Object.keys(values).filter(k => k !== 'id');

      return invalidSecurityValuesError(
        providerName,
        scheme.type,
        scheme.id,
        valueKeys,
        requiredKeys
      );
    };

    if (scheme.type === SecurityType.APIKEY) {
      if (!isApiKeySecurityValues(vals)) {
        throw invalidSchemeValuesErrorBuilder(scheme, vals, ['apikey']);
      }

      result.push({
        ...scheme,
        ...vals,
      });
    } else {
      switch (scheme.scheme) {
        case HttpScheme.BASIC:
          if (!isBasicAuthSecurityValues(vals)) {
            throw invalidSchemeValuesErrorBuilder(scheme, vals, [
              'username',
              'password',
            ]);
          }

          result.push({
            ...scheme,
            ...vals,
          });
          break;

        case HttpScheme.BEARER:
          if (!isBearerTokenSecurityValues(vals)) {
            throw invalidSchemeValuesErrorBuilder(scheme, vals, ['token']);
          }

          result.push({
            ...scheme,
            ...vals,
          });
          break;

        case HttpScheme.DIGEST:
          if (!isDigestSecurityValues(vals)) {
            throw invalidSchemeValuesErrorBuilder(scheme, vals, ['digest']);
          }

          result.push({
            ...scheme,
            ...vals,
          });
          break;
      }
    }
  }

  return result;
}
