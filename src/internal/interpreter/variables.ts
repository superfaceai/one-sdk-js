// Arrays should be considered opaque value and therefore act as a primitive
export type Primitive = string | boolean | number | unknown[];
export type NonPrimitive = {
  [key: string]: Primitive | NonPrimitive | undefined;
};
export type Variables = Primitive | NonPrimitive;

export function assertIsVariables(
  input: unknown
): asserts input is Variables | undefined {
  if (
    !['string', 'number', 'boolean', 'object', 'undefined'].includes(
      typeof input
    )
  ) {
    throw new Error(`Invalid result type: ${typeof input}`);
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
    throw new Error('Input is not NonPrimitive');
  }

  return variables;
}

export function isPrimitive(input: Variables): input is Primitive {
  return (
    ['string', 'number', 'boolean'].includes(typeof input) ||
    Array.isArray(input)
  );
}

export function isNonPrimitive(input: Variables): input is NonPrimitive {
  return typeof input === 'object' && !Array.isArray(input);
}

export function isEmptyRecord(
  input: Record<string, unknown>
): input is Record<never, never> {
  assertIsVariables(input);

  return isNonPrimitive(input) && Object.keys(input).length === 0;
}

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
    if (r && l && isNonPrimitive(r) && isNonPrimitive(l)) {
      result[key] = mergeVariables(l, r);
    } else {
      result[key] = right[key];
    }
  }

  return result;
};
