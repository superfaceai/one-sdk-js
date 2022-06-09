import { ICrypto } from './crypto';

export function configHash(values: unknown[], crypto: ICrypto): string {
  // create the payload
  const data = values
    .map(value => {
      if (typeof value === 'string') {
        return value;
      } else {
        return JSON.stringify(value);
      }
    })
    .join(';');

  // then hash it
  return crypto.hashString(data, 'MD5');
}
