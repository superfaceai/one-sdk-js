import { UnexpectedError } from '../internal/errors';

/**
 * Creates a deep clone of the value.
 */
export function clone<T>(value: T): T {
  if (value === null) {
    return value;
  }

  if (value instanceof Date) {
    return new Date(value.getTime()) as unknown as T;
  }

  if (Array.isArray(value)) {
    const arrayCopy = [] as unknown[];
    for (const item of value) {
      arrayCopy.push(clone<unknown>(item));
    }

    return arrayCopy as unknown as T;
  }

  if (Buffer.isBuffer(value)) {
    return Buffer.from(value) as unknown as T;
  }

  if (typeof value === 'object') {
    const objectCopy = Object.entries(value).map(([key, value]) => [
      key,
      clone(value) as unknown,
    ]);

    return Object.fromEntries(objectCopy) as unknown as T;
  }

  return value;
}

export function isRecord(input: unknown): input is Record<string, unknown> {
  if (typeof input !== 'object' || input === null) {
    return false;
  }

  return true;
}

/**
 * Recursively descends the record and returns a list of enumerable keys
 */
export function recursiveKeyList(
  record: Record<string, unknown>,
  base?: string
): string[] {
  const keys: string[] = [];

  for (const [key, value] of Object.entries(record)) {
    if (value === undefined) {
      continue;
    }

    let basedKey = key;
    if (base !== undefined) {
      basedKey = base + '.' + key;
    }
    keys.push(basedKey);

    if (typeof value === 'object' && value !== null) {
      keys.push(
        ...recursiveKeyList(value as Record<string, unknown>, basedKey)
      );
    }
  }

  return keys;
}

/**
 * Recursively index into a record.
 *
 * Throws if a child cannot be indexed into.
 */
export function indexRecord<T extends unknown | Record<string, T>>(
  input: Record<string, T>,
  key: string[]
): T | undefined {
  // check for input being undefined is for sanity only
  if (key.length === 0 || input === null || input === undefined) {
    return undefined;
  }

  if (key.length === 1) {
    return input[key[0]];
  }

  const currentKey = key.shift();
  if (currentKey === undefined) {
    throw new UnexpectedError('unreachable');
  }

  const next = input[currentKey];
  if (!isRecord(next)) {
    throw new UnexpectedError('Cannot index into non-object');
  }

  return indexRecord(next as Record<string, T>, key);
}
