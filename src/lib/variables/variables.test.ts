import type { NonPrimitive } from './variables';
import {
  isEmptyRecord,
  isNone,
  isNonPrimitive,
  isPrimitive,
  mergeVariables,
  variablesToStrings,
  variableToString,
} from './variables';

describe('Variables', () => {
  describe('isNone', () => {
    it.each([undefined, null])('returns true for %p', (input) => {
      expect(isNone(input)).toBe(true);
    });

    it.each([0, 1, '', Buffer.alloc(0)])('returns false for %p', (input) => {
      expect(isNone(input)).toBe(false);
    });
  });

  describe('isPrimitive', () => {
    it.each([
      'string', 123, false, ['heeeelo'], null, undefined,
    ])('returns true for %p', (input) => {
      expect(isPrimitive(input)).toBe(true);
    });

    it.each([
      { x: 1 }
    ])('returns false for %p', (input) => {
      expect(isPrimitive(input)).toBe(false);
    });
  });

  describe('isNonPrimitive', () => {
    it.each([
      'string', 123, false, ['heeeelo'], null
    ])('returns false for %p', (input) => {
      expect(isNonPrimitive(input)).toBe(false);
    });

    it.each([
      { x: 1 }
    ])('returns true for %p', (input) => {
      expect(isNonPrimitive(input)).toBe(true);
    });
  });

  describe('isEmptyRecord', () => {
    it('returns true for {}', () => {
      expect(isEmptyRecord({})).toBe(true);
    });

    it('returns false fror { a: 1 }', () => {
      expect(isEmptyRecord({ a: 1 })).toBe(false);
    });
  })

  describe('mergeVariables', () => {
    it('merges two simple objects', () => {
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

    it('merges complex objects', () => {
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

    it('overwrites from left to right', () => {
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

  describe('variableToString', () => {
    it.each([
      ['1', 1],
      ['undefined', undefined],
      ['null', null],
      ['false', false,],
    ])('returns %p for %p', (result, input) => {
      expect(variableToString(input)).toBe(result);
    });

    it('returns stringified Buffer', () => {
      expect(variableToString(Buffer.from('123'))).toBe('123');
    });
  });

  describe('variablesToStrings', () => {
    it('stringifies values', () => {
      const variables: NonPrimitive = {
        some: 'value',
        and: 17,
        not: undefined,
        soNot: null,
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
