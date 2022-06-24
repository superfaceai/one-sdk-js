import {
  assertIsVariables,
  getValue,
  isNonPrimitive,
  isPrimitive,
  mergeVariables,
  NonPrimitive,
  variablesToStrings,
} from './variables';

describe('Variables', () => {
  test('assertIsVariables works correctly', () => {
    expect(() => assertIsVariables('string')).not.toThrow();
    expect(() => assertIsVariables(123)).not.toThrow();
    expect(() => assertIsVariables({ x: 1 })).not.toThrow();
    expect(() => assertIsVariables(true)).not.toThrow();
    expect(() => assertIsVariables(undefined)).not.toThrow();
    expect(() => assertIsVariables(['heeelo'])).not.toThrow();
    expect(() => assertIsVariables(() => 'boom!')).toThrow();
  });

  test('isPrimitive works correctly', () => {
    expect(isPrimitive('string')).toBe(true);
    expect(isPrimitive(123)).toBe(true);
    expect(isPrimitive(false)).toBe(true);
    expect(isPrimitive(['heeeelo'])).toBe(true);
    expect(isPrimitive({ x: 1 })).toBe(false);
  });

  test('isNonPrimitive works correctly', () => {
    expect(isNonPrimitive('string')).toBe(false);
    expect(isNonPrimitive(123)).toBe(false);
    expect(isNonPrimitive(false)).toBe(false);
    expect(isNonPrimitive(['heeeelo'])).toBe(false);
    expect(isNonPrimitive({ x: 1 })).toBe(true);
  });

  describe('mergeVariables', () => {
    it('should correctly merge two simple objects', () => {
      {
        const left = {};
        const right = { x: 1 };
        const result = mergeVariables(left, right);

        expect(result).toEqual({ x: 1 });
      }
      {
        const left = { y: 2 };
        const right = {};
        const result = mergeVariables(left, right);

        expect(result).toEqual({ y: 2 });
      }
      {
        const left = { y: 2 };
        const right = { x: 1 };
        const result = mergeVariables(left, right);

        expect(result).toEqual({ x: 1, y: 2 });
      }
    });

    it('should correctly merge complex objects', () => {
      {
        const left = {};
        const right = { ne: { st: 'ed' } };
        const result = mergeVariables(left, right);

        expect(result).toEqual({ ne: { st: 'ed' } });
      }
      {
        const left = { not: 'nested' };
        const right = { ne: { st: 'ed' } };
        const result = mergeVariables(left, right);

        expect(result).toEqual({ ne: { st: 'ed' }, not: 'nested' });
      }
      {
        const left = { ne: { est: 'eed' } };
        const right = { ne: { st: 'ed' } };
        const result = mergeVariables(left, right);

        expect(result).toEqual({ ne: { st: 'ed', est: 'eed' } });
      }
    });

    it('should overwrite from left to right', () => {
      {
        const left = { overwritten: false };
        const right = { overwritten: true };
        const result = mergeVariables(left, right);

        expect(result).toEqual({ overwritten: true });
      }
      {
        const left = { overwritten: { yes: false, no: false } };
        const right = { overwritten: { yes: true } };
        const result = mergeVariables(left, right);

        expect(result).toEqual({ overwritten: { yes: true, no: false } });
      }
      {
        const left = { overwritten: 7 };
        const right = { overwritten: ['seven'] };
        const result = mergeVariables(left, right);

        expect(result).toEqual({ overwritten: ['seven'] });
      }
    });
  });

  describe('getValue', () => {
    it('should get values correctly', () => {
      const variables: NonPrimitive = {
        some: {
          deeply: {
            nested: {
              value: 42,
            },
          },
          other: {
            stuff: 666,
          },
        },
      };
      expect(
        getValue(variables, ['some', 'deeply', 'nested', 'value'])
      ).toEqual(42);
      expect(getValue(variables, ['some', 'other', 'stuff'])).toEqual(666);
      expect(getValue(variables, ['some', 'other'])).toEqual({ stuff: 666 });
    });

    it('should return undefined when the value is not present', () => {
      const variables: NonPrimitive = {
        some: {
          deeply: {
            nested: {
              value: 42,
            },
          },
          other: {
            stuff: 666,
          },
        },
      };
      expect(getValue(variables, [])).toBeUndefined();
      expect(
        getValue(variables, ['some', 'nonexistant', 'stuff'])
      ).toBeUndefined();
      expect(getValue(undefined, ['some', 'stuff'])).toBeUndefined();
    });
  });

  describe('valuesToStrings', () => {
    it('should correctly stringify values', () => {
      const variables: NonPrimitive = {
        some: 'value',
        and: 17,
        not: undefined,
        array: ['some', 'array'],
      };
      expect(variablesToStrings(variables)).toEqual({
        some: 'value',
        and: '17',
        array: '["some","array"]',
      });
    });
  });
});
