import { createHash } from 'crypto';

import { UnexpectedError } from '../..';
import { FetchInstance } from './interfaces';

/**
 * Represents algorithm used in Digest auth.
 */
type DigestAlgorithm = 'MD5' | 'MD5-sess' | 'SHA-256' | 'SHA-256-sess';
/**
 * Represents values extracted from initial digest call
 */
type DigestAuthValues = {
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
export class DigestHelper {
  private readonly nonceRaw: string = 'abcdef0123456789';

  constructor(
    private readonly user: string,
    private readonly password: string,
    private readonly fetchInstance: FetchInstance,
    private readonly cnonceSize: number = 32,
    //407 can be also used when communicating thru proxy https://datatracker.ietf.org/doc/html/rfc2617#section-1.2
    private readonly statusCode: number = 401,
    //"Proxy-Authenticate" can be also used when communicating thru proxy https://datatracker.ietf.org/doc/html/rfc2617#section-1.2
    private readonly header: string = 'www-authenticate',
    private nc: number = 0
  ) {}

  /**
   * Sends request to specified url, expectes response with 401 (or custom) status code,
   * extracts digest values from response and prepares Authorization header for final request
   * Logic is havily inspired by: https://github.com/devfans/digest-fetch/blob/master/digest-fetch-src.js and https://en.wikipedia.org/wiki/Digest_access_authentication
   */
  async prepareAuth(url: string, method: string): Promise<string> {
    const resp = await this.fetchInstance.fetch(url, { method });
    if (resp.status !== this.statusCode) {
      throw new UnexpectedError(
        `Digest auth failed, server returned unexpected code ${resp.status}`,
        resp
      );
    }
    const digestValues = this.extractDigestValues(resp.headers[this.header]);
    if (!digestValues) {
      throw new UnexpectedError(
        `Digest auth failed, unable to extract digest values from response. Header "${this.header}" not found`,
        resp
      );
    }

    return this.buildDigestAuth(url, method, digestValues);
  }

  private buildDigestAuth(
    url: string,
    method: string,
    digest: DigestAuthValues
  ): string {
    const uri = new URL(url).pathname;

    //Default H1
    let ha1 = DigestHelper.computeHash(
      digest.algorithm,
      `${this.user}:${digest.realm}:${this.password}`
    );

    //sess H1 contains original H1 and also nonce and cnonce
    if (digest.algorithm.endsWith('-sess')) {
      ha1 = DigestHelper.computeHash(
        digest.algorithm,
        `${ha1}:${digest.nonce}:${digest.cnonce}`
      );
    }

    //H2 is same for default and sess
    const ha2 = DigestHelper.computeHash(digest.algorithm, `${method}:${uri}`);

    const ncString = `00000000${this.nc}`.slice(-8);

    let response: string;
    //Use  QOP
    if (digest.qop) {
      //https://datatracker.ietf.org/doc/html/rfc7616#section-3.4.1
      response = `${ha1}:${digest.nonce}:${ncString}:${digest.cnonce}:${digest.qop}:${ha2}`;
    } else {
      response = `${ha1}:${digest.nonce}:${ha2}`;
    }

    //Hash response
    const hashedResponse = DigestHelper.computeHash(digest.algorithm, response);

    //Build final auth header
    const opaqueString = digest.opaque ? `opaque="${digest.opaque}",` : '';
    const qopString = digest.qop ? `qop="${digest.qop}",` : '';

    return `${digest.scheme} username="${this.user}",realm="${digest.realm}",\
    nonce="${digest.nonce}",uri="${uri}",${opaqueString}${qopString}\
    algorithm="${digest.algorithm}",response="${hashedResponse}",nc=${ncString},cnonce="${digest.cnonce}"`;
  }

  private extractDigestValues(header: string): DigestAuthValues | undefined {
    //TODO: why 5
    if (header.length < 5) {
      return;
    }

    this.nc++;

    return {
      scheme: header.split(/\s/)[0],
      algorithm: this.extractAlgorithm(header),
      realm: (this.extract(header, 'realm', false) || '').replace(/["]/g, ''),
      opaque: this.extract(header, 'opaque'),
      qop: this.extractQop(header),
      nonce: this.extract(header, 'nonce') || '',
      cnonce: this.makeNonce(),
    };
  }

  /**
   * Extracts "MD5", "MD5-sess", "SHA-256" or "SHA-256-sess" algorithm from passed header. "MD5" is default value.
   * @param rawHeader string containing algorithm type
   * @returns "MD5", "MD5-sess", "SHA-256" or "SHA-256-sess"
   */
  private extractAlgorithm(rawHeader: string): DigestAlgorithm {
    const extractedValue = this.extract(rawHeader, 'algorithm');

    if (extractedValue !== undefined) {
      if (extractedValue.includes('MD5')) {
        return 'MD5';
      } else if (extractedValue.includes('MD5-sess')) {
        return 'MD5-sess';
      } else if (extractedValue.includes('SHA-256')) {
        return 'SHA-256';
      } else if (extractedValue.includes('SHA-256-sess')) {
        return 'SHA-256-sess';
      } else {
        //Throw when we get unexpected value
        throw new UnexpectedError(
          `Digest auth failed, parameter "algorithm" has unexpected value`,
          extractedValue
        );
      }
    }

    //When not specified use MD5
    return 'MD5';
  }

  private extractQop(rawHeader: string): 'auth' | 'auth-int' | undefined {
    // Following https://en.wikipedia.org/wiki/Digest_access_authentication
    // to parse valid qop
    // Samples
    // : qop="auth,auth-init",realm=
    // : qop=auth,realm=
    const parsedQop = this.extract(rawHeader, 'qop');

    if (parsedQop !== undefined) {
      const qops = parsedQop.split(',');
      if (qops.includes('auth-int')) {
        return 'auth-int';
      } else if (qops.includes('auth')) {
        return 'auth';
      } else {
        throw new UnexpectedError(
          `Digest auth failed, parameter "quality of protection" has unexpected value`,
          parsedQop
        );
      }
    }

    // when not specified
    return undefined;
  }

  private makeNonce() {
    let uid = '';
    for (let i = 0; i < this.cnonceSize; ++i) {
      uid += this.nonceRaw[Math.floor(Math.random() * this.nonceRaw.length)];
    }

    return uid;
  }

  private extract(raw: string, field: string, trim = true): string | undefined {
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
  private static computeHash(algorithm: DigestAlgorithm, data: string): string {
    let usedAlgorithm;
    if (algorithm.startsWith('MD5')) {
      usedAlgorithm = 'MD5';
    } else if (algorithm.startsWith('SHA-256')) {
      usedAlgorithm = 'sha256';
    } else {
      throw new UnexpectedError(
        `Digest auth failed, parameter "algorithm" has unexpected value`,
        algorithm
      );
    }
    
return createHash(usedAlgorithm).update(data).digest('hex');
  }
}
