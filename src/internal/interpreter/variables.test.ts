import { assertIsVariables, mergeVariables } from './variables';

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
});
