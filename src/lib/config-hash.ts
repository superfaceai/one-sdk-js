import { createHash } from 'crypto';

export function configHash(values: unknown[]): string {
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
  const hash = createHash('md5');
  hash.update(data);

  return hash.digest('hex');
}
