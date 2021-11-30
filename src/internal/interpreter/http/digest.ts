import { createHash } from 'crypto';

import { UnexpectedError } from '../..';
import { FetchInstance } from './interfaces';

/**
 * Represents values extracted from fir digest call
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
    private readonly precomputedHash?: boolean,
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
    digest: DigestAutValues
  ): string {
    const _url = url.replace('//', '');
    const uri = _url.indexOf('/') == -1 ? '/' : _url.slice(_url.indexOf('/'));

    let ha1 = this.precomputedHash
      ? this.password
      : DigestHelper.computeHash(this.user, digest.realm, this.password);
    if (digest.algorithm === 'MD5-sess' && !this.precomputedHash) {
      ha1 = createHash('MD5')
        .update(`${ha1}:${digest.nonce}:${digest.cnonce}`)
        .digest('hex');
    }

    const ha2 = createHash('MD5').update(`${method}:${uri}${''}`).digest('hex');

    const ncString = `00000000${this.nc}`.slice(-8);

    let _response = `${ha1}:${digest.nonce}:${ha2}`;
    if (digest.qop) {
      _response = `${ha1}:${digest.nonce}:${ncString}:${digest.cnonce}:${digest.qop}:${ha2}`;
    }

    const response = createHash('MD5').update(_response).digest('hex');

    const opaqueString = digest.opaque ? `opaque="${digest.opaque}",` : '';
    const qopString = digest.qop ? `qop="${digest.qop}",` : '';

    return `${digest.scheme} username="${this.user}",realm="${digest.realm}",\
    nonce="${digest.nonce}",uri="${uri}",${opaqueString}${qopString}\
    algorithm="${digest.algorithm}",response="${response}",nc=${ncString},cnonce="${digest.cnonce}"`;
  }

  private extractDigestValues(header: string): DigestAutValues | undefined {
    if (!header || header.length < 5) {
      return;
    }

    this.nc++;

    return {
      scheme: header.split(/\s/)[0],
      algorithm: this.parseAlgorithm(header),
      realm: (this.parse(header, 'realm', false) || '').replace(/["]/g, ''),
      opaque: this.parse(header, 'opaque'),
      qop: this.parseQop(header),
      nonce: this.parse(header, 'nonce') || '',
      cnonce: this.makeNonce(),
    };
  }

  parseAlgorithm(rawAuth: string): 'MD5' | 'MD5-sess' {
    const _algorithm = this.parse(rawAuth, 'algorithm');

    if (_algorithm !== undefined && _algorithm.includes('MD5-sess')) {
      return 'MD5-sess';
    }

    // when not specified
    return 'MD5';
  }

  parseQop(rawAuth: string): 'auth' | 'auth-int' | undefined {
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

  private static computeHash(
    user: string,
    realm: string,
    password: string
  ): string {
    return createHash('MD5')
      .update(`${user}:${realm}:${password}`)
      .digest('hex');
  }
}
