import type { IBinaryData} from '../../interfaces';
import { isBinaryData } from '../../interfaces';
import { UnexpectedError } from '../error';
import { indexRecord } from '../object';

// Arrays should be considered opaque value and therefore act as a primitive, same with
export type Primitive =
  | string
  | boolean
  | number
  | unknown[]
  | IBinaryData
  | Buffer;
export type NonPrimitive = {
  [key: string]: Primitive | NonPrimitive | undefined;
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

export function assertIsVariables(
  input: unknown
): asserts input is Variables | undefined {
  if (
    !['string', 'number', 'boolean', 'object', 'undefined'].includes(
      typeof input
    )
  ) {
    throw new UnexpectedError(`Invalid result type: ${typeof input}`);
  }
}

export function castToVariables(input: unknown): Variables | undefined {
  assertIsVariables(input);

  return input;
}

export function castToNonPrimitive(input: unknown): NonPrimitive | undefined {
  const variables = castToVariables(input);
  if (variables === undefined) {
    return undefined;
  }

  if (!isNonPrimitive(variables)) {
    throw new UnexpectedError('Input is not NonPrimitive');
  }

  return variables;
}

export function isPrimitive(input: Variables): input is Primitive {
  return (
    ['string', 'number', 'boolean'].includes(typeof input) ||
    Array.isArray(input) ||
    isClassInstance(input) ||
    Buffer.isBuffer(input) ||
    isBinaryData(input)
  );
}

export function isNonPrimitive(input: Variables): input is NonPrimitive {
  return (
    typeof input === 'object' &&
    !Array.isArray(input) &&
    !isClassInstance(input) &&
    !Buffer.isBuffer(input) &&
    !isBinaryData(input)
  );
}

export function isEmptyRecord(
  input: Record<string, unknown>
): input is Record<never, never> {
  assertIsVariables(input);

  return isNonPrimitive(input) && Object.keys(input).length === 0;
}

/**
 * Recursively merges variables from `left` and then from `right` into a new object.
 */
export const mergeVariables = (
  left: NonPrimitive,
  right: NonPrimitive
): NonPrimitive => {
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
};

export const getValue = (
  variables: NonPrimitive | undefined,
  key: string[]
): Variables | undefined => {
  if (variables === undefined) {
    return undefined;
  }

  let result;
  try {
    result = indexRecord(variables, key);
  } catch (_err) {
    // return undefined on error to preserve the original behavior of this function
    return undefined;
  }

  // sanity check, but if the input `variables` is correct then the result will be also
  assertIsVariables(result);

  return result;
};

/**
 * Turns a variable (both primitive and non-primitive) into a string.
 */
export const variableToString = (variable: Variables): string => {
  if (typeof variable === 'string') {
    return variable;
  }

  return JSON.stringify(variable);
};

/**
 * Stringifies a Record of variables. `undefined` values are removed.
 */
export const variablesToStrings = (
  variables?: Variables
): Record<string, string> => {
  const result: Record<string, string> = {};

  if (variables !== undefined) {
    for (const [key, value] of Object.entries(variables)) {
      const variableValue = castToVariables(value);
      if (variableValue !== undefined) {
        result[key] = variableToString(variableValue);
      }
    }
  }

  return result;
};
