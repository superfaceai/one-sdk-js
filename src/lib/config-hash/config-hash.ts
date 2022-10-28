import type { ICrypto } from '../../interfaces';

export function configHash(values: unknown[], crypto: ICrypto): string {
  const data = values
    .map(value => {
      if (typeof value === 'string') {
        return value;
      } else {
        return JSON.stringify(value);
      }
    })
    .join(';');

  return crypto.hashString(data, 'MD5');
}
