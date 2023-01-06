import { parseProfile, Source } from '@superfaceai/parser';

import type { ProfileParameterError } from '../../interfaces';
import type { Result, UnexpectedError } from '../../lib';
import { ProfileParameterValidator } from './profile-parameter-validator';
import { InputValidationError, isInputValidationError, isResultValidationError, ResultValidationError } from './profile-parameter-validator.errors';

const parseProfileFromSource = (source: string) =>
  parseProfile(
    new Source(
      `
  name = 'example'
  version = '1.0.0'
` + source
    )
  );

const checkErrorKind = (result: Result<unknown, unknown>) =>
  result.isErr() &&
  (isInputValidationError(result.error)
    ? result.error.errors?.map(error => error.kind)
    : isResultValidationError(result.error) &&
    result.error.errors?.map(error => error.kind));

const checkErrorPath = (result: Result<unknown, unknown>) =>
  result.isErr() &&
  (isInputValidationError(result.error)
    ? result.error.errors?.map(error => error.context?.path)
    : isResultValidationError(result.error) &&
    result.error.errors?.map(error => error.context?.path));

const checkErrorContext = (result: Result<unknown, unknown>) =>
  result.isErr() &&
  (isInputValidationError(result.error)
    ? result.error.errors?.map(error => error.context)
    : isResultValidationError(result.error) &&
    result.error.errors?.map(error => error.context));

describe('ProfileParameterValidator', () => {
  let parameterValidator: ProfileParameterValidator;

  describe('.validate()', () => {
    describe('primitives', () => {
      const ast = parseProfileFromSource(`
        usecase Test {
          result {
            foo boolean
            bar number
            baz string
          }
        }
      `);

      beforeEach(() => {
        parameterValidator = new ProfileParameterValidator(ast);
      });

      it('returns ok for valid values', () => {
        expect(parameterValidator.validate({ foo: true, }, 'result', 'Test').isOk()).toBeTruthy();
        expect(parameterValidator.validate({ bar: 1 }, 'result', 'Test').isOk()).toBeTruthy();
        expect(parameterValidator.validate({ baz: 'value' }, 'result', 'Test').isOk()).toBeTruthy();
      });

      it('returns error for invalid values', () => {
        expect(parameterValidator.validate({ foo: 1 }, 'result', 'Test').isErr()).toBeTruthy();
        expect(parameterValidator.validate({ bar: 'value' }, 'result', 'Test').isErr()).toBeTruthy();
        expect(parameterValidator.validate({ baz: true }, 'result', 'Test').isErr()).toBeTruthy();
      });
    });

    describe('enum', () => {
      const ast = parseProfileFromSource(`
        usecase Test {
          result enum { OK, WARN = 'WARNING', ERR }
        }
      `);

      beforeEach(() => {
        parameterValidator = new ProfileParameterValidator(ast);
      });

      it('returns ok for valid values', () => {
        expect(parameterValidator.validate('OK', 'result', 'Test').isOk()).toBeTruthy();
        expect(parameterValidator.validate('WARNING', 'result', 'Test').isOk()).toBeTruthy();
        expect(parameterValidator.validate('ERR', 'result', 'Test').isOk()).toBeTruthy();
      });

      it('returns error for invalid values', () => {
        expect(parameterValidator.validate('INVALID', 'result', 'Test').isErr()).toBeTruthy();
      });
    });

    describe('object', () => {
      const ast = parseProfileFromSource(`
        usecase Test {
          result {
            field {
              foo boolean
              bar number
              baz string
              waf enum { OK, ERR }
            }
          }
        }
      `);

      beforeEach(() => {
        parameterValidator = new ProfileParameterValidator(ast);
      });

      it('returns ok for valid values', () => {
        expect(parameterValidator.validate(
          {
            field: {
              foo: true,
              bar: 1,
              baz: 'value',
              waf: 'OK'
            }
          }, 'result', 'Test').isOk()).toBeTruthy();
      });

      it('returns error for invalid values', () => {
        expect(parameterValidator.validate({
          field: {
            foo: 1
          }
        }, 'result', 'Test').isErr()).toBeTruthy();
        expect(parameterValidator.validate({
          field: {
            bar: 'value'
          }
        }, 'result', 'Test').isErr()).toBeTruthy();
        expect(parameterValidator.validate({
          field: {
            baz: true
          }
        }, 'result', 'Test').isErr()).toBeTruthy();
        expect(parameterValidator.validate({
          field: {
            waf: 'INVALID'
          }
        }, 'result', 'Test').isErr()).toBeTruthy();
      });
    });

    describe('nested object', () => {
      const ast = parseProfileFromSource(`
        usecase Test {
          result {
            field {
              nestedField {
                foo boolean
                bar number
                baz string
                waf enum { OK, ERR }
              }
            }
          }
        }
      `);

      beforeEach(() => {
        parameterValidator = new ProfileParameterValidator(ast);
      });

      it('returns ok for valid values', () => {
        expect(parameterValidator.validate(
          {
            field: {
              nestedField: {
                foo: true,
                bar: 1,
                baz: 'value',
                waf: 'OK'
              }
            }
          }, 'result', 'Test').isOk()).toBeTruthy();
      });

      it('returns error for invalid values', () => {
        expect(parameterValidator.validate({
          field: {
            nestedField: {
              foo: 1
            }
          }
        }, 'result', 'Test').isErr()).toBeTruthy();
        expect(parameterValidator.validate({
          field: {
            nestedField: {
              bar: 'value'
            }
          }
        }, 'result', 'Test').isErr()).toBeTruthy();
        expect(parameterValidator.validate({
          field: {
            nestedField: {
              baz: true
            }
          }
        }, 'result', 'Test').isErr()).toBeTruthy();
        expect(parameterValidator.validate({
          field: {
            nestedField: {
              waf: 'INVALID'
            }
          }
        }, 'result', 'Test').isErr()).toBeTruthy();
      });
    });

    describe('list', () => {
      const ast = parseProfileFromSource(`
        usecase Test {
          result {
            foo [string]
            bar [{ field string }]
            baz [Model]
          }
        }

        model Model {
          field string
        }
      `);

      beforeEach(() => {
        parameterValidator = new ProfileParameterValidator(ast);
      });

      it('returns ok for valid values', () => {
        expect(parameterValidator.validate({
          foo: ['value'],
          bar: [{ field: 'value' }],
          baz: [{ field: 'value' }],
        }, 'result', 'Test').isOk()).toBeTruthy();
      });

      it('returns error for invalid values', () => {
        expect(parameterValidator.validate({
          foo: [1, true, { field: 'value' }]
        }, 'result', 'Test').isErr()).toBeTruthy();

        expect(parameterValidator.validate({
          bar: [1, true, 'value']
        }, 'result', 'Test').isErr()).toBeTruthy();

        expect(parameterValidator.validate({
          baz: [1, true, 'value']
        }, 'result', 'Test').isErr()).toBeTruthy();
      });
    });

    describe('named model', () => {
      const ast = parseProfileFromSource(`
        usecase Test {
          result Model
        }

        model Model {
          foo string
        }
      `);

      beforeEach(() => {
        parameterValidator = new ProfileParameterValidator(ast);
      });

      it('returns ok for valid values', () => {
        expect(parameterValidator.validate({ foo: 'value', }, 'result', 'Test').isOk()).toBeTruthy();
      });

      it('returns error for invalid values', () => {
        expect(parameterValidator.validate({ foo: 1 }, 'result', 'Test').isErr()).toBeTruthy();
      });
    });

    describe('named field', () => {
      const ast = parseProfileFromSource(`
        usecase Test {
          result {
            foo
          }
        }

        field foo string
      `);

      beforeEach(() => {
        parameterValidator = new ProfileParameterValidator(ast);
      });

      it('returns ok for valid values', () => {
        expect(parameterValidator.validate({ foo: 'value', }, 'result', 'Test').isOk()).toBeTruthy();
      });

      it('returns error for invalid values', () => {
        expect(parameterValidator.validate({ foo: 1 }, 'result', 'Test').isErr()).toBeTruthy();
      });
    });

    describe('named model with named field', () => {
      const ast = parseProfileFromSource(`
        usecase Test {
          result Model
        }

        model Model {
          foo
        }
        field foo string
      `);

      beforeEach(() => {
        parameterValidator = new ProfileParameterValidator(ast);
      });

      it('returns ok for valid values', () => {
        expect(parameterValidator.validate({ foo: 'value', }, 'result', 'Test').isOk()).toBeTruthy();
      });

      it('returns error for invalid values', () => {
        expect(parameterValidator.validate({ foo: 1 }, 'result', 'Test').isErr()).toBeTruthy();
      });
    });

    describe('alias', () => {
      const ast = parseProfileFromSource(`
        usecase Test {
          result AliasedModel
        }

        model Model {
          foo string
        }
        model AliasedModel Model
      `);

      beforeEach(() => {
        parameterValidator = new ProfileParameterValidator(ast);
      });

      it('returns ok for valid values', () => {
        expect(parameterValidator.validate({ foo: 'value', }, 'result', 'Test').isOk()).toBeTruthy();
      });

      it('returns error for invalid values', () => {
        expect(parameterValidator.validate({ foo: 1 }, 'result', 'Test').isErr()).toBeTruthy();
      });
    });

    describe('union', () => {
      const ast = parseProfileFromSource(`
        usecase Test {
          result {
            foo boolean | number | string
            bar Foo | Bar
            baz boolean | Foo | Baz | [string]
          }
        }

        model Foo {
          foo string
        }
        model Bar {
          foo number
          bar string
        }
        model Baz enum { OK, ERR }
      `);

      beforeEach(() => {
        parameterValidator = new ProfileParameterValidator(ast);
      });

      it('returns ok for valid primitives in foo', () => {
        expect(parameterValidator.validate({ foo: true, }, 'result', 'Test').isOk()).toBeTruthy();
        expect(parameterValidator.validate({ foo: 1, }, 'result', 'Test').isOk()).toBeTruthy();
        expect(parameterValidator.validate({ foo: 'value', }, 'result', 'Test').isOk()).toBeTruthy();
      });

      it('returns ok for valid object in bar', () => {
        expect(parameterValidator.validate({ bar: { foo: 'value' } }, 'result', 'Test').isOk()).toBeTruthy();
        expect(parameterValidator.validate({ bar: { foo: 1, bar: 'value' } }, 'result', 'Test').isOk()).toBeTruthy();
      });

      it('returns ok for boolean in baz', () => {
        expect(parameterValidator.validate({ baz: true }, 'result', 'Test').isOk()).toBeTruthy();
      });

      it('returns ok for valid list in baz', () => {
        expect(parameterValidator.validate({ baz: ['value'] }, 'result', 'Test').isOk()).toBeTruthy();
      });

      it('returns ok for valid object in baz', () => {
        expect(parameterValidator.validate({ baz: { foo: 'value' } }, 'result', 'Test').isOk()).toBeTruthy();
      });

      it('returns ok for valid enum value in baz', () => {
        expect(parameterValidator.validate({ baz: 'OK' }, 'result', 'Test').isOk()).toBeTruthy();
      });

      it('returns error for invalid value in foo', () => {
        expect(parameterValidator.validate({ foo: { foo: 'value' } }, 'result', 'Test').isErr()).toBeTruthy();
      });

      it('returns error for invalid value in bar', () => {
        expect(parameterValidator.validate({ bar: { foo: true } }, 'result', 'Test').isErr()).toBeTruthy();
        expect(parameterValidator.validate({ bar: { foo: 'value', bar: 'value' } }, 'result', 'Test').isErr()).toBeTruthy();
      });

      it('returns error for invalid value in baz', () => {
        expect(parameterValidator.validate({ bar: 1 }, 'result', 'Test').isErr()).toBeTruthy();
      });
    });

    describe('untyped fields', () => {
      const ast = parseProfileFromSource(`
        usecase Test {
          result {
            foo
          }
        }
      `);

      beforeEach(() => {
        parameterValidator = new ProfileParameterValidator(ast);
      });

      it('returns ok for any value', () => {
        expect(parameterValidator.validate({ foo: true, }, 'result', 'Test').isOk()).toBeTruthy();
        expect(parameterValidator.validate({ foo: 1, }, 'result', 'Test').isOk()).toBeTruthy();
        expect(parameterValidator.validate({ foo: 'value', }, 'result', 'Test').isOk()).toBeTruthy();
        expect(parameterValidator.validate({ foo: Buffer.alloc(0), }, 'result', 'Test').isOk()).toBeTruthy();
      });
    });

    describe('optional field', () => {
      const ast = parseProfileFromSource(`
        usecase Test {
          result {
            foo string
            bar string!
          }
        }
      `);

      beforeEach(() => {
        parameterValidator = new ProfileParameterValidator(ast);
      });

      it('returns ok for foo and bar not being set', () => {
        expect(parameterValidator.validate({}, 'result', 'Test').isOk()).toBeTruthy();
      });

      it.each([undefined, null, 'value'])('returns ok for bar not set and foo = %p', (value) => {
        expect(parameterValidator.validate({ foo: value }, 'result', 'Test').isOk()).toBeTruthy();
      });

      it('returns ok for foo not set and bar = value', () => {
        expect(parameterValidator.validate({ foo: 'value' }, 'result', 'Test').isOk()).toBeTruthy();
      });
    });

    describe('required field', () => {
      const ast = parseProfileFromSource(`
        usecase Test {
          result {
            foo! string
          }
        }
      `);

      beforeEach(() => {
        parameterValidator = new ProfileParameterValidator(ast);
      });

      it.each([undefined, null, 'value'])('returns ok for foo being %p', (value) => {
        expect(parameterValidator.validate({ foo: value }, 'result', 'Test').isOk()).toBeTruthy();
      });

      it('returns error for foo not being set', () => {
        expect(parameterValidator.validate({}, 'result', 'Test').isErr()).toBeTruthy();
      });
    });

    describe('optional value', () => {
      const ast = parseProfileFromSource(`
        usecase Test {
          result {
            foo Foo
            bar [string]
            baz string | number
            waf
          }
        }

        model Foo enum { OK, ERR }
        field waf string
      `);

      beforeEach(() => {
        parameterValidator = new ProfileParameterValidator(ast);
      });

      it.each(['foo', 'bar', 'baz', 'waf'])('returns ok for %s being null', (fieldName) => {
        expect(parameterValidator.validate({ [fieldName]: null }, 'result', 'Test').isOk()).toBeTruthy();
      });

      it.each(['foo', 'bar', 'baz', 'waf'])('returns ok for %s being undefined', (fieldName) => {
        expect(parameterValidator.validate({ [fieldName]: undefined }, 'result', 'Test').isOk()).toBeTruthy();
      });
    });

    describe('required value', () => {
      const ast = parseProfileFromSource(`
        usecase Test {
          result {
            foo Foo!
            bar [string!]!
            baz string! | number!
            waf
          }
        }

        model Foo enum { OK, ERR }
        field waf string!
      `);

      beforeEach(() => {
        parameterValidator = new ProfileParameterValidator(ast);
      });

      it.each(['foo', 'bar', 'baz', 'waf'])('returns error for %s = undefined', (fieldName) => {
        expect(parameterValidator.validate({ [fieldName]: undefined }, 'result', 'Test').isErr()).toBeTruthy();
      });

      it.each(['foo', 'bar', 'baz', 'waf'])('returns error for %s = null', (fieldName) => {
        expect(parameterValidator.validate({ [fieldName]: null }, 'result', 'Test').isErr()).toBeTruthy();
      });

      it.each([undefined, null])('returns error for %p in bar\'s value', (value) => {
        expect(parameterValidator.validate({ bar: [value] }, 'result', 'Test').isErr()).toBeTruthy();
      });
    });

    describe('extraneous fields', () => {
      const ast = parseProfileFromSource(`
        usecase Test {
          result {
            foo! string!
          }
        }
      `);

      beforeEach(() => {
        parameterValidator = new ProfileParameterValidator(ast);
      });

      it('returns ok for set extra field', () => {
        expect(parameterValidator.validate({ foo: 'value', bar: 1 }, 'result', 'Test').isOk()).toBeTruthy();
      });

      it('returns error for invalid foo type', () => {
        expect(parameterValidator.validate({ foo: 1, bar: 1 }, 'result', 'Test').isErr()).toBeTruthy();
      });

      it('returns error for missing foo', () => {
        expect(parameterValidator.validate({ bar: 1 }, 'result', 'Test').isErr()).toBeTruthy();
      });
    });

    describe('input validation', () => {
      const ast = parseProfileFromSource(`
        usecase Test {
          input {
            foo Foo
          }
        }

        model Foo {
          foo
          bar enum { OK, ERR }!
          baz [string!]!
          waf number
        }
        field Foo string!
      `);

      beforeEach(() => {
        parameterValidator = new ProfileParameterValidator(ast);
      });

      it('returns ok for valid input data', () => {
        expect(parameterValidator.validate({
          foo: {
            foo: 'value',
            bar: 'OK',
            baz: ['value'],
            waf: null,
          }
        }, 'input', 'Test').isOk()).toBeTruthy();
      });
    });

    describe('result validation', () => {
      describe('primitive', () => {
        const ast = parseProfileFromSource(`
          usecase Test {
            result string!
          }
        `);

        beforeEach(() => {
          parameterValidator = new ProfileParameterValidator(ast);
        });

        it("returns ok for `'value'` as result", () => {
          expect(parameterValidator.validate('value', 'result', 'Test').isOk()).toBeTruthy();
        });

        it.each([null, undefined, 1, true, {}])('returns error for `%p` as result', (value) => {
          expect(parameterValidator.validate(value, 'result', 'Test').isErr()).toBeTruthy();
        });
      });

      describe('enum', () => {
        const ast = parseProfileFromSource(`
          usecase Test {
            result enum { OK, ERR }
          }
        `);

        beforeEach(() => {
          parameterValidator = new ProfileParameterValidator(ast);
        });

        it.each(['OK', undefined, null])('returns ok for %p as result', (value) => {
          expect(parameterValidator.validate(value, 'result', 'Test').isOk()).toBeTruthy();
        });
      });

      describe('list', () => {
        const ast = parseProfileFromSource(`
          usecase Test {
            result [string!]
          }
        `);

        beforeEach(() => {
          parameterValidator = new ProfileParameterValidator(ast);
        });

        it.each([undefined, null, [], ['value']])('returns ok for `%p` as result', (value) => {
          expect(parameterValidator.validate(value, 'result', 'Test').isOk()).toBeTruthy();
        });
      });

      describe('object', () => {
        const ast = parseProfileFromSource(`
          usecase Test {
            result {
              foo string
            }
          }
        `);

        beforeEach(() => {
          parameterValidator = new ProfileParameterValidator(ast);
        });

        it.each([undefined, null, {}, { foo: 'value' }])('returns ok for `%p` as result', (value) => {
          expect(parameterValidator.validate(value, 'result', 'Test').isOk()).toBeTruthy();
        });
      });

      describe('required value', () => {
        const ast = parseProfileFromSource(`
          usecase Test {
            result string!
          }
        `);

        beforeEach(() => {
          parameterValidator = new ProfileParameterValidator(ast);
        });

        it.each([undefined, null])('returns error for %p as result', (value) => {
          expect(parameterValidator.validate(value, 'result', 'Test').isErr()).toBeTruthy();
        });
      });
    });

    describe('validation error', () => {
      const ast = parseProfileFromSource(`
        usecase Test safe {
          input {
            foo! string!
          }

          result {
            bar! string!
          }
        }
      `);

      beforeEach(() => {
        parameterValidator = new ProfileParameterValidator(ast);
      });

      it('returns InputValidationError instance', () => {
        const result = parameterValidator.validate(
          {},
          'input',
          'Test'
        );

        expect(result.isErr() && result.error).toBeInstanceOf(InputValidationError);
      });

      it('returns ResultValidationError instance', () => {
        const result = parameterValidator.validate(
          {},
          'result',
          'Test'
        );

        expect(result.isErr() && result.error).toBeInstanceOf(ResultValidationError);
      });

      describe('for wrong type', () => {
        let result: Result<undefined, ProfileParameterError | UnexpectedError>;

        beforeEach(() => {
          result = parameterValidator.validate(
            { foo: 1 },
            'input',
            'Test'
          );
        });

        it("returns errorKind = 'wrongType'", () => {
          expect(checkErrorKind(result)).toEqual(['wrongType']);
        });

        it('returns errorPath = [input, foo]', () => {
          expect(checkErrorPath(result)).toEqual([['input', 'foo']]);
        });

        it('returns context', () => {
          expect(checkErrorContext(result)).toMatchObject([{ expected: 'string' }]);
          expect(checkErrorContext(result)).toMatchObject([{ actual: 'number' }]);
        })
      });
    });
  });
});
