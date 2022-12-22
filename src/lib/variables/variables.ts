import type { IBinaryData } from '../../interfaces';
import { isBinaryData } from '../../interfaces';
import { UnexpectedError } from '../error';

export type None = undefined | null;
export type Primitive =
  | string
  | boolean
  | number
  | unknown[] // Arrays should be considered opaque value and therefore act as a primitive, same with
  | None
  | IBinaryData
  | Buffer;
export type NonPrimitive = {
  [key: string]: Primitive | NonPrimitive;
};
export type Variables = Primitive | NonPrimitive;

// FIXME: This is temporary solution; find a better way to handle this
export function isClassInstance(input: unknown): boolean {
  return (
    typeof input === 'object' &&
    input !== null &&
    input.constructor.name !== 'Object'
  );
}

export function isNone(input: unknown): input is None {
  return input === undefined || input === null;
}

export function isPrimitive(input: unknown): input is Primitive {
  return (
    ['string', 'number', 'boolean'].includes(typeof input) ||
    Array.isArray(input) ||
    isNone(input) ||
    isBinaryData(input) ||
    Buffer.isBuffer(input) ||
    isClassInstance(input)
  );
}

export function isNonPrimitive(input: unknown): input is NonPrimitive {
  return (
    typeof input === 'object' &&
    input !== null &&
    !Array.isArray(input) &&
    !isBinaryData(input) &&
    !Buffer.isBuffer(input) &&
    !isClassInstance(input)
  );
}

export function isVariables(input: unknown): input is Variables {
  return isPrimitive(input) || isNonPrimitive(input);
}

export function isEmptyRecord(
  input: Record<string, unknown>
): input is Record<never, never> {
  return isNonPrimitive(input) && Object.keys(input).length === 0;
}

export function assertIsVariables(
  input: unknown
): asserts input is Variables {
  if (!isVariables(input)) {
    throw new UnexpectedError(`Invalid result type: ${typeof input}`);
  }
}

export function castToVariables(input: unknown): Variables {
  assertIsVariables(input);

  return input;
}

export function castToNonPrimitive(input: unknown): NonPrimitive {
  if (!isNonPrimitive(input)) {
    throw new UnexpectedError('Input is not NonPrimitive');
  }

  return input;
}

/**
 * Recursively merges variables from `left` and then from `right` into a new object.
 */
export function mergeVariables(
  left: NonPrimitive,
  right: NonPrimitive
): NonPrimitive {
  const result: NonPrimitive = {};

  for (const key of Object.keys(left)) {
    result[key] = left[key];
  }
  for (const key of Object.keys(right)) {
    const l = left[key];
    const r = right[key];
    if (
      r !== undefined &&
      l !== undefined &&
      isNonPrimitive(r) &&
      isNonPrimitive(l)
    ) {
      result[key] = mergeVariables(l, r);
    } else {
      result[key] = right[key];
    }
  }

  return result;
}

/**
 * Turns a variable (both primitive and non-primitive) into a string.
 */
export function variableToString(variable: Variables): string {
  if (typeof variable === 'string') {
    return variable;
  }

  if (variable === undefined) {
    return 'undefined'; // TODO: for both undefined and null, return 'None'?
  }

  if (Buffer.isBuffer(variable)) {
    return variable.toString();
  }

  return JSON.stringify(variable);
}

/**
 * Stringifies a Record of variables. `undefined` values are removed.
 */
export function variablesToStrings(
  variables: Variables
): Record<string, string> {
  const result: Record<string, string> = {};

  if (!isNone(variables)) {
    for (const [key, value] of Object.entries(variables)) {
      if (!isNone(value)) {
        result[key] = variableToString(value);
      }
    }
  }

  return result;
}
