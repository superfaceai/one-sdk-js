import {
  inputConstraintAccept,
  inputConstraintAcceptOne,
  inputConstraintRespected,
  inputQueryConstraint,
  isProviderMustBeConstraint,
  isProviderMustBeOneOfConstraint,
  optionalInputQueryConstraint,
  ProviderConstraint,
  providerConstraintMustBe,
  providerConstraintMustBeOneOf,
  resultConstraintPresent,
  resultParameterConstraint,
} from './constraints';

describe('constraints', () => {
  describe('inputConstraintAccept', () => {
    it('return correct object', () => {
      const fn = inputConstraintAccept<string>('test');
      expect(fn('test-value')).toEqual({
        type: 'mustAccept',
        name: 'test',
        value: 'test-value',
      });
    });
  });

  describe('inputConstraintAcceptOne', () => {
    it('return correct object', () => {
      const fn = inputConstraintAcceptOne<string>('test');
      expect(fn(['test-value1', 'test-value2'])).toEqual({
        type: 'mustAcceptOneOf',
        name: 'test',
        value: ['test-value1', 'test-value2'],
      });
    });
  });

  describe('inputConstraintRespected', () => {
    it('return correct object', () => {
      const fn = inputConstraintRespected('test');
      expect(fn()).toEqual({
        type: 'mustBeRespected',
        name: 'test',
      });
    });
  });

  describe('inputQueryConstraint', () => {
    it('return correct object', () => {
      expect(inputQueryConstraint<string>('test')).toEqual({
        mustAccept: expect.any(Function),
        mustAcceptOneOf: expect.any(Function),
      });
    });
  });

  describe('optionalInputQueryConstraint', () => {
    it('return correct object', () => {
      expect(optionalInputQueryConstraint<string>('test')).toEqual({
        mustAccept: expect.any(Function),
        mustAcceptOneOf: expect.any(Function),
        mustBeRespected: expect.any(Function),
      });
    });
  });

  describe('resultConstraintPresent', () => {
    it('return correct object', () => {
      const fn = resultConstraintPresent('test');
      expect(fn()).toEqual({
        type: 'mustBePresent',
        name: 'test',
      });
    });
  });

  describe('resultParameterConstraint', () => {
    it('return correct object', () => {
      expect(resultParameterConstraint('test')).toEqual({
        mustBePresent: expect.any(Function),
      });
    });
  });

  describe('isProviderMustBeConstraint', () => {
    it('checks type correctly', () => {
      const mockProviderConstraintMustBe: ProviderConstraint = {
        type: 'mustBe',
        value: 'test',
      };
      const mockProviderConstraintMustBeOneOf: ProviderConstraint = {
        type: 'mustBeOneOf',
        values: ['test'],
      };
      expect(isProviderMustBeConstraint(mockProviderConstraintMustBe)).toEqual(
        true
      );
      expect(
        isProviderMustBeConstraint(mockProviderConstraintMustBeOneOf)
      ).toEqual(false);
    });
  });

  describe('isProviderMustBeOneOfConstraint', () => {
    it('checks type correctly', () => {
      const mockProviderConstraintMustBe: ProviderConstraint = {
        type: 'mustBe',
        value: 'test',
      };
      const mockProviderConstraintMustBeOneOf: ProviderConstraint = {
        type: 'mustBeOneOf',
        values: ['test'],
      };
      expect(
        isProviderMustBeOneOfConstraint(mockProviderConstraintMustBe)
      ).toEqual(false);
      expect(
        isProviderMustBeOneOfConstraint(mockProviderConstraintMustBeOneOf)
      ).toEqual(true);
    });
  });

  describe('providerConstraintMustBe', () => {
    it('return correct object', () => {
      expect(providerConstraintMustBe('test')).toEqual({
        type: 'mustBe',
        value: 'test',
      });
    });
  });

  describe('providerConstraintMustBeOneOf', () => {
    it('return correct object', () => {
      expect(providerConstraintMustBeOneOf(['test1', 'test2'])).toEqual({
        type: 'mustBeOneOf',
        values: ['test1', 'test2'],
      });
    });
  });
});
