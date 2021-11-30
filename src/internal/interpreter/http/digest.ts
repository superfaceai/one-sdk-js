import { createHash } from 'crypto';

import { UnexpectedError } from '../..';
import { FetchInstance } from './interfaces';

/**
 * Represents values extracted from initial digest call
 */
type DigestAuthValues = {
  algorithm: 'MD5' | 'MD5-sess';
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
    private readonly cnonceSize?: number,
    private readonly statusCode?: number,
    private nc: number = 0
  ) { }

  /**
   * Sends request to specified url, expectes response with 401 (or custom) status code,
   * extracts digest values from response and prepares Authorization header for final request
   * Logic is havily inspired by: https://github.com/devfans/digest-fetch/blob/master/digest-fetch-src.js and https://en.wikipedia.org/wiki/Digest_access_authentication
   */
  async auth(url: string, method: string): Promise<string> {
    const resp = await this.fetchInstance.fetch(url, { method });
    if (
      resp.status == 401 ||
      (resp.status == this.statusCode && this.statusCode)
    ) {
      const digestValues = this.extractDigestValues(
        resp.headers['www-authenticate']
      );
      if (!digestValues) {
        throw new UnexpectedError(
          'Digest auth failed, unable to extract digest values from response',
          resp
        );
      }

      return this.buildDigestAuth(url, method, digestValues);
    }

    throw new UnexpectedError('Digest auth failed', resp);
  }

  private buildDigestAuth(
    url: string,
    method: string,
    digest: DigestAuthValues
  ): string {
    const uri = new URL(url).pathname

    //Default H1 for MD5 algorithm
    let ha1 = DigestHelper.computeMD5Hash(`${this.user}:${digest.realm}:${this.password}`);

    //MD5-sess H1 contains nonce and cnonce
    if (digest.algorithm === 'MD5-sess') {
      ha1 = DigestHelper.computeMD5Hash(`${ha1}:${digest.nonce}:${digest.cnonce}`)
    }

    //H2 is same for MD5 and M5-sess
    const ha2 = DigestHelper.computeMD5Hash(`${method}:${uri}`)

    const ncString = `00000000${this.nc}`.slice(-8);

    let response: string
    //Use QOP if we have it
    if (digest.qop) {
      response = `${ha1}:${digest.nonce}:${ncString}:${digest.cnonce}:${digest.qop}:${ha2}`;
    } else {
      response = `${ha1}:${digest.nonce}:${ha2}`;
    }

    //Hash response
    const hashedResponse = DigestHelper.computeMD5Hash(response)

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
      realm: (this.parse(header, 'realm', false) || '').replace(/["]/g, ''),
      opaque: this.parse(header, 'opaque'),
      qop: this.parseQop(header),
      nonce: this.parse(header, 'nonce') || '',
      cnonce: this.makeNonce(),
    };
  }

  /**
   * Extracts "MD5" or "MD5-sess" algorithm from passed header. "MD5" is default value.
   * @param header string containing algorithm type
   * @returns "MD5" or "MD5-sess"
   */
  private extractAlgorithm(header: string): 'MD5' | 'MD5-sess' {
    const parsedHeader = this.parse(header, 'algorithm');

    if (parsedHeader !== undefined && parsedHeader.includes('MD5-sess')) {
      return 'MD5-sess';
    }

    // when not specified
    return 'MD5';
  }

  private parseQop(rawAuth: string): 'auth' | 'auth-int' | undefined {
    // Following https://en.wikipedia.org/wiki/Digest_access_authentication
    // to parse valid qop
    // Samples
    // : qop="auth,auth-init",realm=
    // : qop=auth,realm=
    const _qop = this.parse(rawAuth, 'qop');

    if (_qop !== undefined) {
      const qops = _qop.split(',');
      if (qops.includes('auth')) return 'auth';
      else if (qops.includes('auth-int')) return 'auth-int';
    }

    // when not specified
    return undefined;
  }

  private makeNonce() {
    const cnonceSize = this.cnonceSize || 32;
    let uid = '';
    for (let i = 0; i < cnonceSize; ++i) {
      uid += this.nonceRaw[Math.floor(Math.random() * this.nonceRaw.length)];
    }

    return uid;
  }

  private parse(raw: string, field: string, trim = true): string | undefined {
    const regex = new RegExp(`${field}=("[^"]*"|[^,]*)`, 'i');
    const match = regex.exec(raw);
    if (match) return trim ? match[1].replace(/[\s"]/g, '') : match[1];

    return undefined;
  }

  private static computeMD5Hash(
    data: string,
  ): string {
    return createHash('MD5')
      .update(data)
      .digest('hex');
  }
}
