import { parseProfile, Source } from '@superfaceai/parser';

import { Result } from '~lib';

import { ProfileParameterValidator } from './profile-parameter-validator';
import {
  isInputValidationError,
  isResultValidationError,
} from './profile-parameter-validator.errors';

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
  describe('Input', () => {
    describe('AST with no input', () => {
      const ast = parseProfileFromSource(`
        usecase Test safe {
          input {}
        }`);
      let parameterValidator: ProfileParameterValidator;

      beforeEach(() => {
        parameterValidator = new ProfileParameterValidator(ast);
      });

      it('should pass with empty input', () => {
        expect(parameterValidator.validate({}, 'input', 'Test').isOk()).toEqual(
          true
        );
      });

      it('should pass with unused input', () => {
        expect(
          parameterValidator
            .validate({ extra: 'input' }, 'input', 'Test')
            .isOk()
        ).toEqual(true);
      });
    });

    describe('AST with one optional input prop', () => {
      const ast = parseProfileFromSource(`
        usecase Test safe {
          input {
            test
          }
        }
      `);
      let parameterValidator: ProfileParameterValidator;

      beforeEach(() => {
        parameterValidator = new ProfileParameterValidator(ast);
      });

      it('should pass with or without optional prop', () => {
        expect(
          parameterValidator.validate({ test: 'hello' }, 'input', 'Test').isOk()
        ).toEqual(true);
        expect(parameterValidator.validate({}, 'input', 'Test').isOk()).toEqual(
          true
        );
      });

      it('should pass with unused input', () => {
        expect(
          parameterValidator
            .validate(
              {
                test: 'hello',
                another: 'input',
              },
              'input',
              'Test'
            )
            .isOk()
        ).toEqual(true);
        expect(
          parameterValidator
            .validate({ another: 'input' }, 'input', 'Test')
            .isOk()
        ).toEqual(true);
      });
    });

    describe('AST with one optional primitive typed input prop', () => {
      const ast = parseProfileFromSource(`
        usecase Test safe {
          input {
            test string
          }
        }
      `);
      let parameterValidator: ProfileParameterValidator;

      beforeEach(() => {
        parameterValidator = new ProfileParameterValidator(ast);
      });

      it('should pass with missing optional input', () => {
        expect(parameterValidator.validate({}, 'input', 'Test').isOk()).toEqual(
          true
        );
      });

      it('should pass with correct input type', () => {
        expect(
          parameterValidator.validate({ test: 'hello' }, 'input', 'Test').isOk()
        ).toEqual(true);
      });

      it('should fail with incorrect type', () => {
        const result = parameterValidator.validate(
          { test: 7 },
          'input',
          'Test'
        );

        expect(checkErrorKind(result)).toEqual(['wrongType']);
        expect(checkErrorPath(result)).toEqual([['input', 'test']]);
      });
    });

    describe('AST with one nonnullable primitive typed input prop', () => {
      const ast = parseProfileFromSource(`
        usecase Test safe {
          input {
            test! string!
          }
        }
      `);
      let parameterValidator: ProfileParameterValidator;

      beforeEach(() => {
        parameterValidator = new ProfileParameterValidator(ast);
      });

      it('should pass with correct type', () => {
        expect(
          parameterValidator.validate({ test: 'hello' }, 'input', 'Test').isOk()
        ).toEqual(true);
      });

      it('should fail with incorrect type', () => {
        const result = parameterValidator.validate(
          { test: 7 },
          'input',
          'Test'
        );

        expect(checkErrorKind(result)).toEqual(['wrongType']);
        expect(checkErrorPath(result)).toEqual([['input', 'test']]);
      });

      it('should fail with missing field', () => {
        const result = parameterValidator.validate({}, 'input', 'Test');
        expect(checkErrorKind(result)).toEqual(['missingRequired']);
        expect(checkErrorPath(result)).toEqual([['input', 'test']]);
      });

      it('should fail on null', () => {
        const result = parameterValidator.validate(
          { test: null },
          'input',
          'Test'
        );
        expect(checkErrorKind(result)).toEqual(['nullInNonNullable']);
        expect(checkErrorPath(result)).toEqual([['input', 'test']]);
      });
    });

    describe('AST with multiple input props', () => {
      const ast = parseProfileFromSource(`
        usecase Test safe {
          input {
            test! string!
            untyped
            another number
          }
        }
      `);
      let parameterValidator: ProfileParameterValidator;

      beforeEach(() => {
        parameterValidator = new ProfileParameterValidator(ast);
      });

      it('should pass with valid input', () => {
        expect(
          parameterValidator.validate({ test: 'hello' }, 'input', 'Test').isOk()
        ).toEqual(true);
        expect(
          parameterValidator
            .validate({ test: 'hello', untyped: 'hello' }, 'input', 'Test')
            .isOk()
        ).toEqual(true);
        expect(
          parameterValidator
            .validate({ test: 'hello', another: 7 }, 'input', 'Test')
            .isOk()
        ).toEqual(true);
        expect(
          parameterValidator
            .validate(
              {
                test: 'hello',
                untyped: false,
                another: 7,
              },
              'input',
              'Test'
            )
            .isOk()
        ).toEqual(true);
      });

      it('should fail with invalid input', () => {
        const result1 = parameterValidator.validate({}, 'input', 'Test');
        expect(checkErrorKind(result1)).toEqual(['missingRequired']);
        expect(checkErrorPath(result1)).toEqual([['input', 'test']]);
        const result2 = parameterValidator.validate(
          { test: 7 },
          'input',
          'Test'
        );
        expect(checkErrorPath(result2)).toEqual([['input', 'test']]);
        expect(checkErrorKind(result2)).toEqual(['wrongType']);
        const result3 = parameterValidator.validate(
          { test: 7, another: 'hello' },
          'input',
          'Test'
        );
        expect(checkErrorPath(result3)).toEqual([
          ['input', 'test'],
          ['input', 'another'],
        ]);
        expect(checkErrorKind(result3)).toEqual(['wrongType', 'wrongType']);
        const result4 = parameterValidator.validate(
          {
            test: 'hello',
            another: 'hello',
          },
          'input',
          'Test'
        );
        expect(checkErrorKind(result4)).toEqual(['wrongType']);
        expect(checkErrorPath(result4)).toEqual([['input', 'another']]);
      });
    });

    describe('AST with predefined field', () => {
      const ast = parseProfileFromSource(`
        usecase Test safe {
          input {
            test
          }
        }

        field test string
      `);
      let parameterValidator: ProfileParameterValidator;

      beforeEach(() => {
        parameterValidator = new ProfileParameterValidator(ast);
      });

      it('should pass with valid input', () => {
        expect(parameterValidator.validate({}, 'input', 'Test').isOk()).toEqual(
          true
        );
        expect(
          parameterValidator.validate({ test: 'hello' }, 'input', 'Test').isOk()
        ).toEqual(true);
      });

      it('should fail with invalid input', () => {
        const result = parameterValidator.validate(
          { test: 7 },
          'input',
          'Test'
        );
        expect(checkErrorKind(result)).toEqual(['wrongType']);
        expect(checkErrorPath(result)).toEqual([['input', 'test']]);
      });
    });

    describe('AST with an enum', () => {
      const ast = parseProfileFromSource(`
        usecase Test safe {
          input {
            test enum { hello, goodbye }
          }
        }
      `);
      let parameterValidator: ProfileParameterValidator;

      beforeEach(() => {
        parameterValidator = new ProfileParameterValidator(ast);
      });

      it('should pass with valid input', () => {
        expect(
          parameterValidator.validate({ test: 'hello' }, 'input', 'Test').isOk()
        ).toEqual(true);
      });

      it('should fail with invalid input', () => {
        const result1 = parameterValidator.validate(
          { test: 'none of your business' },
          'input',
          'Test'
        );
        expect(checkErrorKind(result1)).toEqual(['enumValue']);
        expect(checkErrorPath(result1)).toEqual([['input', 'test']]);
        expect(checkErrorContext(result1)).toMatchObject([
          { actual: '"none of your business"' },
        ]);
        const result2 = parameterValidator.validate(
          { test: 7 },
          'input',
          'Test'
        );
        expect(checkErrorKind(result2)).toEqual(['enumValue']);
        expect(checkErrorPath(result2)).toEqual([['input', 'test']]);
        expect(checkErrorContext(result2)).toMatchObject([{ actual: '7' }]);
      });
    });

    describe('AST with predefined enum', () => {
      const ast = parseProfileFromSource(`
        usecase Test safe {
          input {
            test
          }
        }

        field test enum { hello, goodbye }
      `);
      let parameterValidator: ProfileParameterValidator;

      beforeEach(() => {
        parameterValidator = new ProfileParameterValidator(ast);
      });

      it('should pass with valid input', () => {
        expect(
          parameterValidator.validate({ test: 'hello' }, 'input', 'Test').isOk()
        ).toEqual(true);
      });

      it('should fail with invalid input', () => {
        const result1 = parameterValidator.validate(
          { test: 'none of your business' },
          'input',
          'Test'
        );
        expect(checkErrorKind(result1)).toEqual(['enumValue']);
        expect(checkErrorPath(result1)).toEqual([['input', 'test']]);
        const result2 = parameterValidator.validate(
          { test: 7 },
          'input',
          'Test'
        );
        expect(checkErrorKind(result2)).toEqual(['enumValue']);
        expect(checkErrorPath(result2)).toEqual([['input', 'test']]);
      });
    });

    describe('AST with field-referenced named enum', () => {
      const ast = parseProfileFromSource(`
        usecase Test safe {
          input {
            test
          }
        }

        model TestEnum enum { A, B, C = 'CC', D }
        field test TestEnum
      `);
      let parameterValidator: ProfileParameterValidator;

      beforeEach(() => {
        parameterValidator = new ProfileParameterValidator(ast);
      });

      it.each(['A', 'B', 'CC', 'D'])(
        'should pass with valid input: %s',
        value => {
          expect(
            parameterValidator.validate({ test: value }, 'input', 'Test').isOk()
          ).toEqual(true);
        }
      );

      it.each(['a', 7, true])('should fail with invalid value: %p', value => {
        const result = parameterValidator.validate(
          { test: value },
          'input',
          'Test'
        );
        expect(checkErrorKind(result)).toEqual(['enumValue']);
        expect(checkErrorPath(result)).toEqual([['input', 'test']]);
      });
    });

    describe('AST with object', () => {
      const ast = parseProfileFromSource(`
        usecase Test safe {
          input {
            test {
              hello! string!
            }
          }
        }
      `);
      let parameterValidator: ProfileParameterValidator;

      beforeEach(() => {
        parameterValidator = new ProfileParameterValidator(ast);
      });

      it('should pass with valid input', () => {
        expect(
          parameterValidator
            .validate({ test: { hello: 'world!' } }, 'input', 'Test')
            .isOk()
        ).toEqual(true);
      });

      it('should fail with invalid input', () => {
        const result1 = parameterValidator.validate(
          { test: 'hello!' },
          'input',
          'Test'
        );
        expect(checkErrorKind(result1)).toEqual(['wrongType']);
        expect(checkErrorPath(result1)).toEqual([['input', 'test']]);
        const result2 = parameterValidator.validate(
          { test: {} },
          'input',
          'Test'
        );
        expect(checkErrorKind(result2)).toEqual(['missingRequired']);
        expect(checkErrorPath(result2)).toEqual([['input', 'test', 'hello']]);
        const result3 = parameterValidator.validate(
          { test: { hello: 7 } },
          'input',
          'Test'
        );
        expect(checkErrorKind(result3)).toEqual(['wrongType']);
        expect(checkErrorPath(result3)).toEqual([['input', 'test', 'hello']]);
      });
    });

    describe('AST with nested object', () => {
      const ast = parseProfileFromSource(`
        usecase Test safe {
          input {
            test {
              hello {
                goodbye boolean
              }
            }
          }
        }
      `);
      let parameterValidator: ProfileParameterValidator;

      beforeEach(() => {
        parameterValidator = new ProfileParameterValidator(ast);
      });

      it('should pass with valid input', () => {
        expect(parameterValidator.validate({}, 'input', 'Test').isOk()).toEqual(
          true
        );
        expect(
          parameterValidator.validate({ test: {} }, 'input', 'Test').isOk()
        ).toEqual(true);
        expect(
          parameterValidator
            .validate({ test: { hello: {} } }, 'input', 'Test')
            .isOk()
        ).toEqual(true);
        expect(
          parameterValidator
            .validate({ test: { hello: { goodbye: false } } }, 'input', 'Test')
            .isOk()
        ).toEqual(true);
        expect(
          parameterValidator
            .validate({ test: { hello: { goodbye: null } } }, 'input', 'Test')
            .isOk()
        ).toEqual(true);
      });

      it('should fail with invalid input', () => {
        const result1 = parameterValidator.validate('hello!', 'input', 'Test');
        expect(checkErrorKind(result1)).toEqual(['wrongType']);
        expect(checkErrorPath(result1)).toEqual([['input']]);
        const result2 = parameterValidator.validate(
          { test: 'hello!' },
          'input',
          'Test'
        );
        expect(checkErrorKind(result2)).toEqual(['wrongType']);
        expect(checkErrorPath(result2)).toEqual([['input', 'test']]);
        const result3 = parameterValidator.validate(
          { test: { hello: 'goodbye!' } },
          'input',
          'Test'
        );
        expect(checkErrorKind(result3)).toEqual(['wrongType']);
        expect(checkErrorPath(result3)).toEqual([['input', 'test', 'hello']]);
        const result4 = parameterValidator.validate(
          {
            test: { hello: { goodbye: 'true' } },
          },
          'input',
          'Test'
        );
        expect(checkErrorKind(result4)).toEqual(['wrongType']);
        expect(checkErrorPath(result4)).toEqual([
          ['input', 'test', 'hello', 'goodbye'],
        ]);
      });
    });

    describe('AST with predefined object', () => {
      const ast = parseProfileFromSource(`
        usecase Test safe {
          input {
            test 
          }
        }

        field test {
          hello! string!
        }
      `);
      let parameterValidator: ProfileParameterValidator;

      beforeEach(() => {
        parameterValidator = new ProfileParameterValidator(ast);
      });

      it('should pass with valid input', () => {
        expect(
          parameterValidator
            .validate({ test: { hello: 'world!' } }, 'input', 'Test')
            .isOk()
        ).toEqual(true);
      });

      it('should fail with invalid input', () => {
        const result1 = parameterValidator.validate(
          { test: 'hello!' },
          'input',
          'Test'
        );
        expect(checkErrorKind(result1)).toEqual(['wrongType']);
        expect(checkErrorPath(result1)).toEqual([['input', 'test']]);
        const result2 = parameterValidator.validate(
          { test: {} },
          'input',
          'Test'
        );
        expect(checkErrorKind(result2)).toEqual(['missingRequired']);
        expect(checkErrorPath(result2)).toEqual([['input', 'test', 'hello']]);
        const result3 = parameterValidator.validate(
          { test: { hello: 7 } },
          'input',
          'Test'
        );
        expect(checkErrorKind(result3)).toEqual(['wrongType']);
        expect(checkErrorPath(result3)).toEqual([['input', 'test', 'hello']]);
      });
    });

    describe('AST with union', () => {
      const ast = parseProfileFromSource(`
        usecase Test safe {
          input {
            test string | number
          }
        }
      `);
      let parameterValidator: ProfileParameterValidator;

      beforeEach(() => {
        parameterValidator = new ProfileParameterValidator(ast);
      });

      it('should pass with valid input', () => {
        expect(parameterValidator.validate({}, 'input', 'Test').isOk()).toEqual(
          true
        );
        expect(
          parameterValidator.validate({ test: 'hello' }, 'input', 'Test').isOk()
        ).toEqual(true);
        expect(
          parameterValidator.validate({ test: 7 }, 'input', 'Test').isOk()
        ).toEqual(true);
      });

      it('should fail with invalid input', () => {
        const result = parameterValidator.validate(
          { test: true },
          'input',
          'Test'
        );
        expect(checkErrorKind(result)).toEqual(['wrongUnion']);
        expect(checkErrorPath(result)).toEqual([['input', 'test']]);
      });
    });

    describe('AST with predefined non-nullable union', () => {
      const ast = parseProfileFromSource(`
        usecase Test safe {
          input {
            test! TestUnion!
          }
        }

        model TestUnion string | number
      `);
      let parameterValidator: ProfileParameterValidator;

      beforeEach(() => {
        parameterValidator = new ProfileParameterValidator(ast);
      });

      it('should pass with valid input', () => {
        expect(
          parameterValidator.validate({ test: 'hello' }, 'input', 'Test').isOk()
        ).toEqual(true);
        expect(
          parameterValidator.validate({ test: 7 }, 'input', 'Test').isOk()
        ).toEqual(true);
      });

      it('should fail with invalid input', () => {
        const result1 = parameterValidator.validate({}, 'input', 'Test');
        expect(checkErrorKind(result1)).toEqual(['missingRequired']);
        expect(checkErrorPath(result1)).toEqual([['input', 'test']]);
        const result2 = parameterValidator.validate(
          { test: true },
          'input',
          'Test'
        );
        expect(checkErrorKind(result2)).toEqual(['wrongUnion']);
        expect(checkErrorPath(result2)).toEqual([['input', 'test']]);
      });
    });

    describe('AST with string array', () => {
      const ast = parseProfileFromSource(`
        usecase Test safe {
          input {
            test [string]
          }
        }
      `);
      let parameterValidator: ProfileParameterValidator;

      beforeEach(() => {
        parameterValidator = new ProfileParameterValidator(ast);
      });

      it('should pass with valid input', () => {
        expect(parameterValidator.validate({}, 'input', 'Test').isOk()).toEqual(
          true
        );
        expect(
          parameterValidator.validate({ test: [] }, 'input', 'Test').isOk()
        ).toEqual(true);
        expect(
          parameterValidator
            .validate({ test: ['hello'] }, 'input', 'Test')
            .isOk()
        ).toEqual(true);
        expect(
          parameterValidator
            .validate({ test: ['hello', 'goodbye'] }, 'input', 'Test')
            .isOk()
        ).toEqual(true);
      });

      it('should fail with invalid input', () => {
        const result1 = parameterValidator.validate(
          { test: 7 },
          'input',
          'Test'
        );
        expect(checkErrorKind(result1)).toEqual(['notArray']);
        expect(checkErrorPath(result1)).toEqual([['input', 'test']]);
        const result2 = parameterValidator.validate(
          { test: [7] },
          'input',
          'Test'
        );
        expect(checkErrorKind(result2)).toEqual(['elementsInArrayWrong']);
        expect(checkErrorPath(result2)).toEqual([['input', 'test']]);
      });
    });

    describe('AST with non-nullable array of nullable items', () => {
      const ast = parseProfileFromSource(`
        usecase Test safe {
          input {
            test! [string]!
          }
        }
      `);
      let parameterValidator: ProfileParameterValidator;

      beforeEach(() => {
        parameterValidator = new ProfileParameterValidator(ast);
      });

      it('should pass with valid input', () => {
        expect(
          parameterValidator.validate({ test: [] }, 'input', 'Test').isOk()
        ).toEqual(true);
        expect(
          parameterValidator
            .validate({ test: ['hello'] }, 'input', 'Test')
            .isOk()
        ).toEqual(true);
        expect(
          parameterValidator
            .validate({ test: ['hello', 'goodbye'] }, 'input', 'Test')
            .isOk()
        ).toEqual(true);
      });

      it('should fail with invalid input', () => {
        const result1 = parameterValidator.validate({}, 'input', 'Test');
        expect(checkErrorKind(result1)).toEqual(['missingRequired']);
        expect(checkErrorPath(result1)).toEqual([['input', 'test']]);
        const result2 = parameterValidator.validate(
          { test: 7 },
          'input',
          'Test'
        );
        expect(checkErrorKind(result2)).toEqual(['notArray']);
        expect(checkErrorPath(result2)).toEqual([['input', 'test']]);
        const result3 = parameterValidator.validate(
          { test: [7] },
          'input',
          'Test'
        );
        expect(checkErrorKind(result3)).toEqual(['elementsInArrayWrong']);
        expect(checkErrorPath(result3)).toEqual([['input', 'test']]);
      });
    });

    describe('AST with multiple levels of field references', () => {
      const ast = parseProfileFromSource(`
        usecase Test safe {
          input {
            test
          }
        }

        model TestModel {
          another
        }

        model AnotherModel {
          value
        }

        field test TestModel
        field another AnotherModel
        field value boolean
      `);
      let parameterValidator: ProfileParameterValidator;

      beforeEach(() => {
        parameterValidator = new ProfileParameterValidator(ast);
      });

      it.each([true, false])('should pass with valid input: %s', value => {
        const result = parameterValidator.validate(
          { test: { another: { value } } },
          'input',
          'Test'
        );
        expect(result.isOk()).toEqual(true);
      });

      it.each(['banana'])('should fail with invalid value: %p', value => {
        const result = parameterValidator.validate(
          { test: { another: { value } } },
          'input',
          'Test'
        );
        expect(checkErrorKind(result)).toEqual(['wrongType']);
        expect(checkErrorPath(result)).toEqual([
          ['input', 'test', 'another', 'value'],
        ]);
      });
    });
  });

  describe('Result', () => {
    describe('AST with nested object', () => {
      const ast = parseProfileFromSource(`
        usecase Test safe {
          result {
            test {
              hello {
                goodbye boolean
              }
            }
          }
        }
      `);
      let parameterValidator: ProfileParameterValidator;

      beforeEach(() => {
        parameterValidator = new ProfileParameterValidator(ast);
      });

      it('should pass with valid input', () => {
        expect(
          parameterValidator.validate({}, 'result', 'Test').isOk()
        ).toEqual(true);
        expect(
          parameterValidator.validate({ test: {} }, 'result', 'Test').isOk()
        ).toEqual(true);
        expect(
          parameterValidator
            .validate({ test: { hello: {} } }, 'result', 'Test')
            .isOk()
        ).toEqual(true);
        expect(
          parameterValidator
            .validate({ test: { hello: { goodbye: false } } }, 'result', 'Test')
            .isOk()
        ).toEqual(true);
      });

      it('should fail with invalid input', () => {
        const result1 = parameterValidator.validate('hello!', 'result', 'Test');
        expect(checkErrorKind(result1)).toEqual(['wrongType']);
        expect(checkErrorPath(result1)).toEqual([['result']]);
        const result2 = parameterValidator.validate(
          { test: 'hello!' },
          'result',
          'Test'
        );
        expect(checkErrorKind(result2)).toEqual(['wrongType']);
        expect(checkErrorPath(result2)).toEqual([['result', 'test']]);
        const result3 = parameterValidator.validate(
          { test: { hello: 'goodbye!' } },
          'result',
          'Test'
        );
        expect(checkErrorKind(result3)).toEqual(['wrongType']);
        expect(checkErrorPath(result3)).toEqual([['result', 'test', 'hello']]);
        const result4 = parameterValidator.validate(
          {
            test: { hello: { goodbye: 'true' } },
          },
          'result',
          'Test'
        );
        expect(checkErrorKind(result4)).toEqual(['wrongType']);
        expect(checkErrorPath(result4)).toEqual([
          ['result', 'test', 'hello', 'goodbye'],
        ]);
      });
    });

    describe('AST with multi-typed Enum', () => {
      const ast = parseProfileFromSource(`
        usecase Test safe {
          result {
            test TestEnum
          }
        }

        model TestEnum enum {
          a = 7
          b = true
          c
        }
      `);
      let parameterValidator: ProfileParameterValidator;

      beforeEach(() => {
        parameterValidator = new ProfileParameterValidator(ast);
      });

      it('should pass with valid input', () => {
        expect(
          parameterValidator.validate({}, 'result', 'Test').isOk()
        ).toEqual(true);
        expect(
          parameterValidator.validate({ test: 7 }, 'result', 'Test').isOk()
        ).toEqual(true);
        expect(
          parameterValidator.validate({ test: true }, 'result', 'Test').isOk()
        ).toEqual(true);
        expect(
          parameterValidator.validate({ test: 'c' }, 'result', 'Test').isOk()
        ).toEqual(true);
      });

      it('should fail with invalid input', () => {
        const result1 = parameterValidator.validate(
          { test: 8 },
          'result',
          'Test'
        );
        expect(checkErrorKind(result1)).toEqual(['enumValue']);
        expect(checkErrorPath(result1)).toEqual([['result', 'test']]);
        const result2 = parameterValidator.validate(
          { test: false },
          'result',
          'Test'
        );
        expect(checkErrorKind(result2)).toEqual(['enumValue']);
        expect(checkErrorPath(result2)).toEqual([['result', 'test']]);
        const result3 = parameterValidator.validate(
          { test: 'd' },
          'result',
          'Test'
        );
        expect(checkErrorKind(result3)).toEqual(['enumValue']);
        expect(checkErrorPath(result3)).toEqual([['result', 'test']]);
      });
    });
  });
});
