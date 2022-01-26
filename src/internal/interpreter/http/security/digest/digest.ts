import { DigestSecurityScheme, DigestSecurityValues } from '@superfaceai/ast';
import { createHash } from 'crypto';
import createDebug from 'debug';

import {
  digestHeaderNotFound,
  missingPartOfDigestHeader,
  unexpectedDigestValue,
} from '../../../../errors.helpers';
import { fetchRequest, HttpResponse } from '../../http';
import { FetchInstance } from '../../interfaces';
import {
  AuthCache,
  AuthenticateRequestAsync,
  DEFAULT_AUTHORIZATION_HEADER_NAME,
  ISecurityHandler,
  RequestParameters,
} from '../interfaces';
import { HandleResponse } from '../interfaces';
import { prepareRequest } from '../utils';

const debug = createDebug('superface:http:digest');
const debugSensitive = createDebug('superface:http:digest:sensitive');
debugSensitive(
  `
WARNING: YOU HAVE ALLOWED LOGGING SENSITIVE INFORMATION.
THIS LOGGING LEVEL DOES NOT PREVENT LEAKING SECRETS AND SHOULD NOT BE USED IF THE LOGS ARE GOING TO BE SHARED.
CONSIDER DISABLING SENSITIVE INFORMATION LOGGING BY APPENDING THE DEBUG ENVIRONMENT VARIABLE WITH ",-*:sensitive".
`
);

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
/**
 * Helper for digest authentication
 */
export class DigestHandler implements ISecurityHandler {
  //407 can be also used when communicating thru proxy https://datatracker.ietf.org/doc/html/rfc2617#section-1.2
  private readonly statusCode: number;
  //"Proxy-Authenticate" can be also used when communicating thru proxy https://datatracker.ietf.org/doc/html/rfc2617#section-1.2
  private readonly challangeHeader: string;
  private readonly authorizationHeader: string;
  //Internal
  private readonly nonceRaw: string = 'abcdef0123456789';
  private readonly cnonceSize = 32;
  private nc = 0;

  constructor(
    readonly configuration: DigestSecurityScheme & DigestSecurityValues
  ) {
    debug('Initialized DigestHelper');
    this.statusCode = configuration.statusCode || 401;
    this.challangeHeader = configuration.challengeHeader || 'www-authenticate';
    this.authorizationHeader =
      configuration.authorizationHeader || DEFAULT_AUTHORIZATION_HEADER_NAME;

    debugSensitive(
      `Initialized with: username="${this.configuration.username}", password="${this.configuration.password}", status code=${this.statusCode}, challenge header="${this.challangeHeader}", authorization header="${this.authorizationHeader}"`
    );
  }

  authenticate: AuthenticateRequestAsync = async (
    parameters: RequestParameters,
    fetchInstance: FetchInstance & AuthCache
    // fetch: (
    //   fetchInstance: FetchInstance,
    //   request: HttpRequest
    // ) => Promise<HttpResponse>
  ) => {
    const headers: Record<string, string> = parameters.headers || {};

    //If we have cached credentials we use them
    if (fetchInstance?.digest) {
      debugSensitive(`Using cached digest credentials`);
      headers[
        this.configuration.authorizationHeader ||
          DEFAULT_AUTHORIZATION_HEADER_NAME
      ] = fetchInstance.digest;

      return {
        ...parameters,
        headers,
      };
    }
    //If we don't we try to get challange header
    const response = await fetchRequest(
      fetchInstance,
      prepareRequest({
        ...parameters,
        headers,
      })
    );

    if (
      response.statusCode !== this.statusCode ||
      !response.headers[this.challangeHeader]
    ) {
      throw digestHeaderNotFound(
        this.challangeHeader,
        Object.keys(response.headers)
      );
    }

    debugSensitive(`Getting new digest values`);
    const credentials = this.buildDigestAuth(
      //We need actual resolved url
      response.debug.request.url,
      parameters.method,
      this.extractDigestValues(response.headers[this.challangeHeader])
    );
    fetchInstance.digest = credentials;

    return {
      ...parameters,
      headers: {
        ...headers,
        [this.configuration.authorizationHeader ||
        DEFAULT_AUTHORIZATION_HEADER_NAME]: credentials,
      },
    };
  };

  handleResponse: HandleResponse = (
    response: HttpResponse,
    resourceRequestParameters: RequestParameters,
    cache: AuthCache
  ) => {
    if (response.statusCode === this.statusCode) {
      if (!response.headers[this.challangeHeader]) {
        throw digestHeaderNotFound(
          this.challangeHeader,
          Object.keys(response.headers)
        );
      }
      debugSensitive(`Getting new digest values`);
      const credentials = this.buildDigestAuth(
        //We need actual resolved url
        response.debug.request.url,
        resourceRequestParameters.method,
        this.extractDigestValues(response.headers[this.challangeHeader])
      );
      cache.digest = credentials;

      return {
        ...resourceRequestParameters,
        headers: {
          ...resourceRequestParameters.headers,
          [this.configuration.authorizationHeader ||
          DEFAULT_AUTHORIZATION_HEADER_NAME]: credentials,
        },
      };
    }

    return undefined;
  };

  // prepare(
  //   parameters: RequestParameters,
  //   cache: AuthCache
  // ): BeforeHookAuthResult {
  //   const headers: Record<string, string> = parameters.headers;

  //   if (cache?.digest) {
  //     debugSensitive(`Using cached digest credentials`);
  //     headers[
  //       this.configuration.authorizationHeader ||
  //       DEFAULT_AUTHORIZATION_HEADER_NAME
  //     ] = cache.digest;
  //   }

  //   const request: RequestParameters = {
  //     ...parameters,
  //     headers,
  //   };

  //   return { kind: 'modify', newArgs: [request] };
  // }

  // handle(
  //   response: HttpResponse,
  //   resourceRequestParameters: RequestParameters,
  //   cache: AuthCache
  // ): AffterHookAuthResult {
  //   if (response.statusCode === this.statusCode) {
  //     if (!response.headers[this.challangeHeader]) {
  //       throw digestHeaderNotFound(
  //         this.challangeHeader,
  //         Object.keys(response.headers)
  //       );
  //     }
  //     debugSensitive(`Getting new digest values`);
  //     const credentials = this.buildDigestAuth(
  //       //We need actual resolved url
  //       response.debug.request.url,
  //       resourceRequestParameters.method,
  //       this.extractDigestValues(response.headers[this.challangeHeader])
  //     );
  //     cache.digest = credentials;

  //     return {
  //       kind: 'retry',
  //       newArgs: [
  //         {
  //           ...resourceRequestParameters,
  //           headers: {
  //             ...resourceRequestParameters.headers,
  //             [this.configuration.authorizationHeader ||
  //               DEFAULT_AUTHORIZATION_HEADER_NAME]: credentials,
  //           },
  //         },
  //       ],
  //     };
  //   }

  //   return undefined;
  // }

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
    debugSensitive(
      `Preparing digest authentication for: ${url} and method: ${method}`
    );
    const uri = new URL(url).pathname;

    //Default H1
    let ha1 = computeHash(
      digest.algorithm,
      `${this.configuration.username}:${digest.realm}:${this.configuration.password}`
    );

    //sess H1 contains original H1 and also nonce and cnonce
    if (digest.algorithm.endsWith('-sess')) {
      ha1 = computeHash(
        digest.algorithm,
        `${ha1}:${digest.nonce}:${digest.cnonce}`
      );
    }

    //H2 is same for default and sess
    const ha2 = computeHash(digest.algorithm, `${method}:${uri}`);
    this.nc++;
    const ncString = String(this.nc).padStart(8, '0');

    let response: string;
    //Use  QOP
    if (digest.qop) {
      //https://datatracker.ietf.org/doc/html/rfc7616#section-3.4.1
      response = `${ha1}:${digest.nonce}:${ncString}:${digest.cnonce}:${digest.qop}:${ha2}`;
    } else {
      response = `${ha1}:${digest.nonce}:${ha2}`;
    }

    //Hash response
    const hashedResponse = computeHash(digest.algorithm, response);

    //Build final auth header
    const opaqueString = digest.opaque ? `opaque="${digest.opaque}"` : '';
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
    ].join(',');
  }

  private extractDigestValues(header: string): DigestAuthValues {
    debugSensitive(`Extracting digest authentication values from: ${header}`);

    const scheme = header.split(/\s/)[0];
    if (!scheme) {
      throw missingPartOfDigestHeader(this.challangeHeader, header, 'scheme');
    }
    const nonce = extract(header, 'nonce');
    if (!nonce) {
      throw missingPartOfDigestHeader(this.challangeHeader, header, 'nonce');
    }

    return {
      scheme,
      algorithm: extractAlgorithm(header),
      realm: (extract(header, 'realm', false) || '').replace(/["]/g, ''),
      opaque: extract(header, 'opaque'),
      qop: extractQop(header),
      nonce,
      cnonce: this.makeNonce(),
    };
  }

  private makeNonce(): string {
    let uid = '';
    for (let i = 0; i < this.cnonceSize; ++i) {
      uid += this.nonceRaw[Math.floor(Math.random() * this.nonceRaw.length)];
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

  //When not specified use MD5
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
  //TODO: field should be case-insensitive
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
export function computeHash(algorithm: DigestAlgorithm, data: string): string {
  let usedAlgorithm;
  if (algorithm.startsWith('MD5')) {
    usedAlgorithm = 'MD5';
  } else {
    usedAlgorithm = 'sha256';
  }

  return createHash(usedAlgorithm).update(data).digest('hex');
}
