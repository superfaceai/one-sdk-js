import { createHash, randomInt } from 'crypto';

import { ICrypto } from '~core';

export class NodeCrypto implements ICrypto {
  public hashString(input: string, algorithm: 'MD5' | 'sha256'): string {
    const hash = createHash(algorithm);
    hash.update(input);

    return hash.digest('hex');
  }

  public randomInt(max: number): number {
    return randomInt(max);
  }
}
