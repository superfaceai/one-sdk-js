/**
 * Creates a deep clone of the value.
 */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Recursively descends the record and returns a list of enumerable all keys
 *
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
