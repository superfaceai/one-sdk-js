import type {
  DigestSecurityScheme,
  DigestSecurityValues,
} from '@superfaceai/ast';

import type { ICrypto, ILogger, LogFunction } from '../../../../../interfaces';
import { pipe } from '../../../../../lib';
import {
  digestHeaderNotFound,
  missingPartOfDigestHeader,
  unexpectedDigestValue,
} from '../../../../errors';
import {
  fetchFilter,
  isCompleteHttpRequest,
  prepareRequestFilter,
  withRequest,
} from '../../filters';
import type { HttpMultiMap, IFetch } from '../../interfaces';
import type { HttpResponse } from '../../types';
import type {
  AuthCache,
  AuthenticateRequestAsync,
  HandleResponseAsync,
  ISecurityHandler,
  RequestParameters,
} from '../interfaces';
import { DEFAULT_AUTHORIZATION_HEADER_NAME } from '../interfaces';

const DEBUG_NAMESPACE = 'http:security:digest-handler';
const DEBUG_NAMESPACE_SENSITIVE = 'http:security:digest-handler:sensitive';

/**
 * Represents algorithm used in Digest auth.
 */
type DigestAlgorithm = 'MD5' | 'MD5-sess' | 'SHA-256' | 'SHA-256-sess';

/**
 * Represents values extracted from initial digest call
 */
export type DigestAuthValues = {
  algorithm: DigestAlgorithm;
  scheme: string;
  realm: string;
  qop: 'auth' | 'auth-int' | undefined;
  opaque: string | undefined;
  nonce: string;
  cnonce: string;
};

export function hashDigestConfiguration(
  configuration: DigestSecurityValues,
  crypto: ICrypto
): string {
  return crypto.hashString(
    configuration.id + configuration.username + configuration.password,
    'MD5'
  );
}

/**
 * Helper for digest authentication
 */
export class DigestHandler implements ISecurityHandler {
  private readonly log?: LogFunction;
  private readonly logSensitive?: LogFunction;
  // 407 can be also used when communicating thru proxy https://datatracker.ietf.org/doc/html/rfc2617#section-1.2
  private readonly statusCode: number;
  // "Proxy-Authenticate" can be also used when communicating thru proxy https://datatracker.ietf.org/doc/html/rfc2617#section-1.2
  private readonly challengeHeader: string;
  private readonly authorizationHeader: string;
  // Internal
  private readonly nonceRaw: string = 'abcdef0123456789';
  private readonly cnonceSize = 32;
  private nc = 0;

  constructor(
    public readonly configuration: DigestSecurityScheme & DigestSecurityValues,
    private readonly fetchInstance: IFetch & AuthCache,
    private readonly crypto: ICrypto,
    private readonly logger?: ILogger
  ) {
    this.log = logger?.log(DEBUG_NAMESPACE);
    this.logSensitive = logger?.log(DEBUG_NAMESPACE_SENSITIVE);
    this.log?.('Initialized DigestHandler');
    this.statusCode = configuration.statusCode ?? 401;
    this.challengeHeader = configuration.challengeHeader ?? 'www-authenticate';
    this.authorizationHeader =
      configuration.authorizationHeader ?? DEFAULT_AUTHORIZATION_HEADER_NAME;

    this.logSensitive?.(
      `Initialized with: username="${this.configuration.username}", password="${this.configuration.password}", status code=${this.statusCode}, challenge header="${this.challengeHeader}", authorization header="${this.authorizationHeader}"`
    );
  }

  public authenticate: AuthenticateRequestAsync = async (
    parameters: RequestParameters
  ) => {
    const headers: HttpMultiMap = parameters.headers ?? {};

    const credentials = await this.fetchInstance.digest.getCached(
      hashDigestConfiguration(this.configuration, this.crypto),
      async () => {
        const { response } = await pipe(
          {
            parameters: {
              ...parameters,
              headers,
            },
          },
          prepareRequestFilter,
          withRequest(fetchFilter(this.fetchInstance, this.logger))
        );

        if (response === undefined) {
          throw new Error('Response is undefined');
        }

        if (
          response.statusCode !== this.statusCode ||
          !response.headers[this.challengeHeader]
        ) {
          throw digestHeaderNotFound(
            this.challengeHeader,
            Object.keys(response.headers)
          );
        }

        this.log?.('Getting new digest values');
        const credentials = this.buildDigestAuth(
          // We need actual resolved url
          response.debug.request.url,
          parameters.method,
          this.extractDigestValues(response.headers[this.challengeHeader])
        );

        return credentials;
      }
    );

    return {
      ...parameters,
      headers: {
        ...headers,
        [this.configuration.authorizationHeader ??
        DEFAULT_AUTHORIZATION_HEADER_NAME]: credentials,
      },
    };
  };

  public handleResponse: HandleResponseAsync = async (
    response: HttpResponse,
    resourceRequestParameters: RequestParameters
  ) => {
    if (response.statusCode === this.statusCode) {
      if (!response.headers[this.challengeHeader]) {
        throw digestHeaderNotFound(
          this.challengeHeader,
          Object.keys(response.headers)
        );
      }
      const configurationHash = hashDigestConfiguration(
        this.configuration,
        this.crypto
      );
      this.fetchInstance.digest.invalidate(configurationHash);
      const credentials = this.fetchInstance.digest.getCached(
        configurationHash,
        () => {
          this.log?.('Getting new digest values');

          return this.buildDigestAuth(
            // We need actual resolved url
            response.debug.request.url,
            resourceRequestParameters.method,
            this.extractDigestValues(response.headers[this.challengeHeader])
          );
        }
      );

      const prepared = await prepareRequestFilter({
        parameters: {
          ...resourceRequestParameters,
          headers: {
            ...resourceRequestParameters.headers,
            [this.configuration.authorizationHeader ??
            DEFAULT_AUTHORIZATION_HEADER_NAME]: credentials,
          },
        },
      });

      if (
        prepared.request === undefined ||
        !isCompleteHttpRequest(prepared.request)
      ) {
        throw new Error('Request is undefined');
      }

      return prepared.request;
    }

    return;
  };

  /**
   *
   * @param url url of the request
   * @param method HTTP method
   * @param digest extracted of cached digest values
   * @returns string containing information needed to digest authorization
   */
  private buildDigestAuth(
    url: string,
    method: string,
    digest: DigestAuthValues
  ): string {
    this.log?.(
      `Preparing digest authentication for: ${url} and method: ${method}`
    );
    const uri = new URL(url).pathname;

    // Default H1
    let ha1 = computeHash(
      digest.algorithm,
      `${this.configuration.username}:${digest.realm}:${this.configuration.password}`,
      this.crypto
    );

    // sess H1 contains original H1 and also nonce and cnonce
    if (digest.algorithm.endsWith('-sess')) {
      ha1 = computeHash(
        digest.algorithm,
        `${ha1}:${digest.nonce}:${digest.cnonce}`,
        this.crypto
      );
    }

    // H2 is same for default and sess
    const ha2 = computeHash(digest.algorithm, `${method}:${uri}`, this.crypto);
    this.nc++;
    const ncString = String(this.nc).padStart(8, '0');

    let response: string;
    // Use  QOP
    if (digest.qop) {
      // https://datatracker.ietf.org/doc/html/rfc7616#section-3.4.1
      response = `${ha1}:${digest.nonce}:${ncString}:${digest.cnonce}:${digest.qop}:${ha2}`;
    } else {
      response = `${ha1}:${digest.nonce}:${ha2}`;
    }

    // Hash response
    const hashedResponse = computeHash(digest.algorithm, response, this.crypto);

    // Build final auth header
    const opaqueString =
      digest.opaque !== undefined ? `opaque="${digest.opaque}"` : '';
    const qopString = digest.qop ? `qop="${digest.qop}"` : '';

    return [
      `${digest.scheme} username="${this.configuration.username}"`,
      `realm="${digest.realm}"`,
      `nonce="${digest.nonce}"`,
      `uri="${uri}"`,
      opaqueString,
      qopString,
      `algorithm="${digest.algorithm}"`,
      `response="${hashedResponse}"`,
      `nc=${ncString}`,
      `cnonce="${digest.cnonce}"`,
    ]
      .filter(s => s !== '')
      .join(',');
  }

  private extractDigestValues(header: string): DigestAuthValues {
    this.logSensitive?.(
      `Extracting digest authentication values from: ${header}`
    );

    const scheme = header.split(/\s/)[0];
    if (!scheme) {
      throw missingPartOfDigestHeader(this.challengeHeader, header, 'scheme');
    }
    const nonce = extract(header, 'nonce');
    if (nonce === undefined) {
      throw missingPartOfDigestHeader(this.challengeHeader, header, 'nonce');
    }

    return {
      scheme,
      algorithm: extractAlgorithm(header),
      realm: (extract(header, 'realm', false) ?? '').replace(/["]/g, ''),
      opaque: extract(header, 'opaque'),
      qop: extractQop(header),
      nonce,
      cnonce: this.makeNonce(),
    };
  }

  private makeNonce(): string {
    let uid = '';
    for (let i = 0; i < this.cnonceSize; ++i) {
      uid += this.nonceRaw[this.crypto.randomInt(this.nonceRaw.length)];
    }

    return uid;
  }
}

/**
 * Extracts "MD5", "MD5-sess", "SHA-256" or "SHA-256-sess" algorithm from passed header. "MD5" is default value.
 * @param rawHeader string containing algorithm type
 * @returns "MD5", "MD5-sess", "SHA-256" or "SHA-256-sess"
 */
export function extractAlgorithm(rawHeader: string): DigestAlgorithm {
  const extractedValue = extract(rawHeader, 'algorithm');

  if (extractedValue !== undefined) {
    if (extractedValue === 'MD5') {
      return 'MD5';
    } else if (extractedValue === 'MD5-sess') {
      return 'MD5-sess';
    } else if (extractedValue === 'SHA-256') {
      return 'SHA-256';
    } else if (extractedValue === 'SHA-256-sess') {
      return 'SHA-256-sess';
    } else {
      throw unexpectedDigestValue('algorithm', extractedValue, [
        'MD5',
        'MD5-sess',
        'SHA-256',
        'SHA-256-sess',
      ]);
    }
  }

  // When not specified use MD5
  return 'MD5';
}

/**
 * Extracts QOP from raw header. Throws on values other than "auth" or "auth-int"
 * @param rawHeader string containing qop
 * @returns "auth", "auth-int" or undefined
 */
export function extractQop(rawHeader: string): 'auth' | 'auth-int' | undefined {
  // Following https://en.wikipedia.org/wiki/Digest_access_authentication
  // to parse valid qop
  // Samples
  // : qop="auth,auth-init",realm=
  // : qop=auth,realm=
  const parsedQop = extract(rawHeader, 'qop');

  if (parsedQop !== undefined) {
    const qops = parsedQop.split(',');
    if (qops.includes('auth-int')) {
      return 'auth-int';
    } else if (qops.includes('auth')) {
      return 'auth';
    } else {
      throw unexpectedDigestValue('quality of protection', qops.join(', '), [
        'auth',
        'auth-int',
      ]);
    }
  }

  // when not specified
  return undefined;
}

function extract(raw: string, field: string, trim = true): string | undefined {
  const regex = new RegExp(`${field}=("[^"]*"|[^,]*)`, 'i');
  const match = regex.exec(raw);
  if (match) return trim ? match[1].replace(/[\s"]/g, '') : match[1];

  return undefined;
}

/**
 * Computes hash from data using specified algorithm
 * @param algorithm used to compute hash
 * @param data data to be hashed
 * @returns hashed data
 */
export function computeHash(
  algorithm: DigestAlgorithm,
  data: string,
  crypto: ICrypto
): string {
  const usedAlgorithm = algorithm.startsWith('MD5') ? 'MD5' : 'sha256';

  return crypto.hashString(data, usedAlgorithm);
}
