import { ProfileDocumentNode, ProfileHeaderNode } from '@superfaceai/ast';

import { Result } from '../../lib';
import { ProfileParameterValidator } from './profile-parameter-validator';
import {
  isInputValidationError,
  isResultValidationError,
} from './profile-parameter-validator.errors';

const header: ProfileHeaderNode = {
  kind: 'ProfileHeader',
  name: 'example',
  version: {
    major: 0,
    minor: 0,
    patch: 0,
  },
};

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
      const ast: ProfileDocumentNode = {
        kind: 'ProfileDocument',
        header,
        definitions: [
          {
            kind: 'UseCaseDefinition',
            useCaseName: 'Test',
            input: {
              kind: 'UseCaseSlotDefinition',
              value: {
                kind: 'ObjectDefinition',
                fields: [],
              },
            },
          },
        ],
      };
      const parameterValidator = new ProfileParameterValidator(ast);

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
      const ast: ProfileDocumentNode = {
        kind: 'ProfileDocument',
        header,
        definitions: [
          {
            kind: 'UseCaseDefinition',
            useCaseName: 'Test',
            input: {
              kind: 'UseCaseSlotDefinition',
              value: {
                kind: 'ObjectDefinition',
                fields: [
                  {
                    kind: 'FieldDefinition',
                    required: false,
                    fieldName: 'test',
                  },
                ],
              },
            },
          },
        ],
      };
      const parameterValidator = new ProfileParameterValidator(ast);

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
      const ast: ProfileDocumentNode = {
        kind: 'ProfileDocument',
        header,
        definitions: [
          {
            kind: 'UseCaseDefinition',
            useCaseName: 'Test',
            input: {
              kind: 'UseCaseSlotDefinition',
              value: {
                kind: 'ObjectDefinition',
                fields: [
                  {
                    kind: 'FieldDefinition',
                    fieldName: 'test',
                    required: false,
                    type: {
                      kind: 'PrimitiveTypeName',
                      name: 'string',
                    },
                  },
                ],
              },
            },
          },
        ],
      };
      const parameterValidator = new ProfileParameterValidator(ast);

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
      const ast: ProfileDocumentNode = {
        kind: 'ProfileDocument',
        header,
        definitions: [
          {
            kind: 'UseCaseDefinition',
            useCaseName: 'Test',
            input: {
              kind: 'UseCaseSlotDefinition',
              value: {
                kind: 'ObjectDefinition',
                fields: [
                  {
                    kind: 'FieldDefinition',
                    fieldName: 'test',
                    required: true,
                    type: {
                      kind: 'NonNullDefinition',
                      type: {
                        kind: 'PrimitiveTypeName',
                        name: 'string',
                      },
                    },
                  },
                ],
              },
            },
          },
        ],
      };
      const parameterValidator = new ProfileParameterValidator(ast);

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
      const ast: ProfileDocumentNode = {
        kind: 'ProfileDocument',
        header,
        definitions: [
          {
            kind: 'UseCaseDefinition',
            useCaseName: 'Test',
            input: {
              kind: 'UseCaseSlotDefinition',
              value: {
                kind: 'ObjectDefinition',
                fields: [
                  {
                    kind: 'FieldDefinition',
                    fieldName: 'test',
                    required: true,
                    type: {
                      kind: 'NonNullDefinition',
                      type: {
                        kind: 'PrimitiveTypeName',
                        name: 'string',
                      },
                    },
                  },
                  {
                    kind: 'FieldDefinition',
                    required: false,
                    fieldName: 'untyped',
                  },
                  {
                    kind: 'FieldDefinition',
                    required: false,
                    fieldName: 'another',
                    type: {
                      kind: 'PrimitiveTypeName',
                      name: 'number',
                    },
                  },
                ],
              },
            },
          },
        ],
      };
      const parameterValidator = new ProfileParameterValidator(ast);

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
      const ast: ProfileDocumentNode = {
        kind: 'ProfileDocument',
        header,
        definitions: [
          {
            kind: 'UseCaseDefinition',
            useCaseName: 'Test',
            input: {
              kind: 'UseCaseSlotDefinition',
              value: {
                kind: 'ObjectDefinition',
                fields: [
                  {
                    kind: 'FieldDefinition',
                    required: false,
                    fieldName: 'test',
                  },
                ],
              },
            },
          },
          {
            kind: 'NamedFieldDefinition',
            fieldName: 'test',
            type: {
              kind: 'PrimitiveTypeName',
              name: 'string',
            },
          },
        ],
      };
      const parameterValidator = new ProfileParameterValidator(ast);

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
      const ast: ProfileDocumentNode = {
        kind: 'ProfileDocument',
        header,
        definitions: [
          {
            kind: 'UseCaseDefinition',
            useCaseName: 'Test',
            input: {
              kind: 'UseCaseSlotDefinition',
              value: {
                kind: 'ObjectDefinition',
                fields: [
                  {
                    kind: 'FieldDefinition',
                    required: false,
                    fieldName: 'test',
                    type: {
                      kind: 'EnumDefinition',
                      values: [
                        {
                          kind: 'EnumValue',
                          value: 'hello',
                        },
                        {
                          kind: 'EnumValue',
                          value: 'goodbye',
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
        ],
      };
      const parameterValidator = new ProfileParameterValidator(ast);

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
      const ast: ProfileDocumentNode = {
        kind: 'ProfileDocument',
        header,
        definitions: [
          {
            kind: 'UseCaseDefinition',
            useCaseName: 'Test',
            input: {
              kind: 'UseCaseSlotDefinition',
              value: {
                kind: 'ObjectDefinition',
                fields: [
                  {
                    kind: 'FieldDefinition',
                    required: false,
                    fieldName: 'test',
                  },
                ],
              },
            },
          },
          {
            kind: 'NamedFieldDefinition',
            fieldName: 'test',
            type: {
              kind: 'EnumDefinition',
              values: [
                {
                  kind: 'EnumValue',
                  value: 'hello',
                },
                {
                  kind: 'EnumValue',
                  value: 'goodbye',
                },
              ],
            },
          },
        ],
      };
      const parameterValidator = new ProfileParameterValidator(ast);

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

    describe('AST with object', () => {
      const ast: ProfileDocumentNode = {
        kind: 'ProfileDocument',
        header,
        definitions: [
          {
            kind: 'UseCaseDefinition',
            useCaseName: 'Test',
            input: {
              kind: 'UseCaseSlotDefinition',
              value: {
                kind: 'ObjectDefinition',
                fields: [
                  {
                    kind: 'FieldDefinition',
                    required: false,
                    fieldName: 'test',
                    type: {
                      kind: 'ObjectDefinition',
                      fields: [
                        {
                          kind: 'FieldDefinition',
                          required: true,
                          fieldName: 'hello',
                          type: {
                            kind: 'NonNullDefinition',
                            type: {
                              kind: 'PrimitiveTypeName',
                              name: 'string',
                            },
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
        ],
      };
      const parameterValidator = new ProfileParameterValidator(ast);

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
      const ast: ProfileDocumentNode = {
        kind: 'ProfileDocument',
        header,
        definitions: [
          {
            kind: 'UseCaseDefinition',
            useCaseName: 'Test',
            input: {
              kind: 'UseCaseSlotDefinition',
              value: {
                kind: 'ObjectDefinition',
                fields: [
                  {
                    kind: 'FieldDefinition',
                    required: false,
                    fieldName: 'test',
                    type: {
                      kind: 'ObjectDefinition',
                      fields: [
                        {
                          kind: 'FieldDefinition',
                          required: false,
                          fieldName: 'hello',
                          type: {
                            kind: 'ObjectDefinition',
                            fields: [
                              {
                                kind: 'FieldDefinition',
                                required: false,
                                fieldName: 'goodbye',
                                type: {
                                  kind: 'PrimitiveTypeName',
                                  name: 'boolean',
                                },
                              },
                            ],
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
        ],
      };
      const parameterValidator = new ProfileParameterValidator(ast);

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
      const ast: ProfileDocumentNode = {
        kind: 'ProfileDocument',
        header,
        definitions: [
          {
            kind: 'UseCaseDefinition',
            useCaseName: 'Test',
            input: {
              kind: 'UseCaseSlotDefinition',
              value: {
                kind: 'ObjectDefinition',
                fields: [
                  {
                    kind: 'FieldDefinition',
                    required: false,
                    fieldName: 'test',
                  },
                ],
              },
            },
          },
          {
            kind: 'NamedFieldDefinition',
            fieldName: 'test',
            type: {
              kind: 'ObjectDefinition',
              fields: [
                {
                  kind: 'FieldDefinition',
                  required: true,
                  fieldName: 'hello',
                  type: {
                    kind: 'NonNullDefinition',
                    type: {
                      kind: 'PrimitiveTypeName',
                      name: 'string',
                    },
                  },
                },
              ],
            },
          },
        ],
      };
      const parameterValidator = new ProfileParameterValidator(ast);

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
      const ast: ProfileDocumentNode = {
        kind: 'ProfileDocument',
        header,
        definitions: [
          {
            kind: 'UseCaseDefinition',
            useCaseName: 'Test',
            input: {
              kind: 'UseCaseSlotDefinition',
              value: {
                kind: 'ObjectDefinition',
                fields: [
                  {
                    kind: 'FieldDefinition',
                    required: false,
                    fieldName: 'test',
                    type: {
                      kind: 'UnionDefinition',
                      types: [
                        {
                          kind: 'PrimitiveTypeName',
                          name: 'string',
                        },
                        {
                          kind: 'PrimitiveTypeName',
                          name: 'number',
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
        ],
      };
      const parameterValidator = new ProfileParameterValidator(ast);

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
      const ast: ProfileDocumentNode = {
        kind: 'ProfileDocument',
        header,
        definitions: [
          {
            kind: 'UseCaseDefinition',
            useCaseName: 'Test',
            input: {
              kind: 'UseCaseSlotDefinition',
              value: {
                kind: 'ObjectDefinition',
                fields: [
                  {
                    kind: 'FieldDefinition',
                    required: true,
                    fieldName: 'test',
                    type: {
                      kind: 'NonNullDefinition',
                      type: {
                        kind: 'ModelTypeName',
                        name: 'TestUnion',
                      },
                    },
                  },
                ],
              },
            },
          },
          {
            kind: 'NamedModelDefinition',
            modelName: 'TestUnion',
            type: {
              kind: 'UnionDefinition',
              types: [
                {
                  kind: 'PrimitiveTypeName',
                  name: 'string',
                },
                {
                  kind: 'PrimitiveTypeName',
                  name: 'number',
                },
              ],
            },
          },
        ],
      };
      const parameterValidator = new ProfileParameterValidator(ast);

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
      const ast: ProfileDocumentNode = {
        kind: 'ProfileDocument',
        header,
        definitions: [
          {
            kind: 'UseCaseDefinition',
            useCaseName: 'Test',
            input: {
              kind: 'UseCaseSlotDefinition',
              value: {
                kind: 'ObjectDefinition',
                fields: [
                  {
                    kind: 'FieldDefinition',
                    required: false,
                    fieldName: 'test',
                    type: {
                      kind: 'ListDefinition',
                      elementType: {
                        kind: 'PrimitiveTypeName',
                        name: 'string',
                      },
                    },
                  },
                ],
              },
            },
          },
        ],
      };
      const parameterValidator = new ProfileParameterValidator(ast);

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
      const ast: ProfileDocumentNode = {
        kind: 'ProfileDocument',
        header,
        definitions: [
          {
            kind: 'UseCaseDefinition',
            useCaseName: 'Test',
            input: {
              kind: 'UseCaseSlotDefinition',
              value: {
                kind: 'ObjectDefinition',
                fields: [
                  {
                    kind: 'FieldDefinition',
                    required: true,
                    fieldName: 'test',
                    type: {
                      kind: 'NonNullDefinition',
                      type: {
                        kind: 'ListDefinition',
                        elementType: {
                          kind: 'PrimitiveTypeName',
                          name: 'string',
                        },
                      },
                    },
                  },
                ],
              },
            },
          },
        ],
      };
      const parameterValidator = new ProfileParameterValidator(ast);

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
  });

  describe('Result', () => {
    describe('AST with nested object', () => {
      const ast: ProfileDocumentNode = {
        kind: 'ProfileDocument',
        header,
        definitions: [
          {
            kind: 'UseCaseDefinition',
            useCaseName: 'Test',
            result: {
              kind: 'UseCaseSlotDefinition',
              value: {
                kind: 'ObjectDefinition',
                fields: [
                  {
                    kind: 'FieldDefinition',
                    required: false,
                    fieldName: 'test',
                    type: {
                      kind: 'ObjectDefinition',
                      fields: [
                        {
                          kind: 'FieldDefinition',
                          required: false,
                          fieldName: 'hello',
                          type: {
                            kind: 'ObjectDefinition',
                            fields: [
                              {
                                kind: 'FieldDefinition',
                                required: false,
                                fieldName: 'goodbye',
                                type: {
                                  kind: 'PrimitiveTypeName',
                                  name: 'boolean',
                                },
                              },
                            ],
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
        ],
      };
      const parameterValidator = new ProfileParameterValidator(ast);

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
      const ast: ProfileDocumentNode = {
        kind: 'ProfileDocument',
        header,
        definitions: [
          {
            kind: 'UseCaseDefinition',
            useCaseName: 'Test',
            result: {
              kind: 'UseCaseSlotDefinition',
              value: {
                kind: 'ObjectDefinition',
                fields: [
                  {
                    kind: 'FieldDefinition',
                    required: false,
                    fieldName: 'test',
                    type: {
                      kind: 'ModelTypeName',
                      name: 'TestEnum',
                    },
                  },
                ],
              },
            },
          },
          {
            kind: 'NamedModelDefinition',
            modelName: 'TestEnum',
            type: {
              kind: 'EnumDefinition',
              values: [
                {
                  kind: 'EnumValue',
                  value: 7,
                },
                {
                  kind: 'EnumValue',
                  value: true,
                },
                {
                  kind: 'EnumValue',
                  value: 'c',
                },
              ],
            },
          },
        ],
      };
      const parameterValidator = new ProfileParameterValidator(ast);

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
