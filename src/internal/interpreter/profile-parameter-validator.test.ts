import { ProfileDocumentNode } from '@superindustries/language';

import { ProfileParameterValidator } from './profile-parameter-validator';

describe('ProfileParameterValidator', () => {
  describe('Input', () => {
    describe('AST with no input', () => {
      const ast: ProfileDocumentNode = {
        kind: 'ProfileDocument',
        profile: {
          kind: 'Profile',
          profileId: {
            kind: 'ProfileId',
            profileId: 'whatever',
          },
        },
        definitions: [
          {
            kind: 'UseCaseDefinition',
            useCaseName: 'Test',
            input: {
              kind: 'ObjectDefinition',
              fields: [],
            },
          },
        ],
      };
      const parameterValidator = new ProfileParameterValidator<
        Record<never, never>
      >(ast, 'input', 'Test');

      it('should pass with empty input', () => {
        expect(parameterValidator.validate({})).toEqual(true);
      });

      it('should pass with unused input', () => {
        expect(parameterValidator.validate({ extra: 'input' })).toEqual(true);
      });
    });

    describe('AST with one optional input prop', () => {
      const ast: ProfileDocumentNode = {
        kind: 'ProfileDocument',
        profile: {
          kind: 'Profile',
          profileId: {
            kind: 'ProfileId',
            profileId: 'whatever',
          },
        },
        definitions: [
          {
            kind: 'UseCaseDefinition',
            useCaseName: 'Test',
            input: {
              kind: 'ObjectDefinition',
              fields: [
                {
                  kind: 'FieldDefinition',
                  fieldName: 'test',
                },
              ],
            },
          },
        ],
      };
      const parameterValidator = new ProfileParameterValidator<{
        test?: string;
      }>(ast, 'input', 'Test');

      it('should pass with or without optional prop', () => {
        expect(parameterValidator.validate({ test: 'hello' })).toEqual(true);
        expect(parameterValidator.validate({})).toEqual(true);
      });

      it('should pass with unused input', () => {
        expect(
          parameterValidator.validate({
            test: 'hello',
            another: 'input',
          } as any)
        ).toEqual(true);
        expect(
          parameterValidator.validate({ another: 'input' } as any)
        ).toEqual(true);
      });
    });

    describe('AST with one optional primitive typed input prop', () => {
      const ast: ProfileDocumentNode = {
        kind: 'ProfileDocument',
        profile: {
          kind: 'Profile',
          profileId: {
            kind: 'ProfileId',
            profileId: 'whatever',
          },
        },
        definitions: [
          {
            kind: 'UseCaseDefinition',
            useCaseName: 'Test',
            input: {
              kind: 'ObjectDefinition',
              fields: [
                {
                  kind: 'FieldDefinition',
                  fieldName: 'test',
                  type: {
                    kind: 'PrimitiveTypeName',
                    name: 'string',
                  },
                },
              ],
            },
          },
        ],
      };
      const parameterValidator = new ProfileParameterValidator<{
        test: string;
      }>(ast, 'input', 'Test');

      it('should pass with missing optional input', () => {
        expect(parameterValidator.validate({} as any)).toEqual(true);
      });

      it('should pass with correct input type', () => {
        expect(parameterValidator.validate({ test: 'hello' })).toEqual(true);
      });

      it('should fail with incorrect type', () => {
        expect(() => parameterValidator.validate({ test: 7 } as any)).toThrow(
          '[input.test] Wrong type: expected string, but got number'
        );
      });
    });

    describe('AST with one nonnullable primitive typed input prop', () => {
      const ast: ProfileDocumentNode = {
        kind: 'ProfileDocument',
        profile: {
          kind: 'Profile',
          profileId: {
            kind: 'ProfileId',
            profileId: 'whatever',
          },
        },
        definitions: [
          {
            kind: 'UseCaseDefinition',
            useCaseName: 'Test',
            input: {
              kind: 'ObjectDefinition',
              fields: [
                {
                  kind: 'FieldDefinition',
                  fieldName: 'test',
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
      const parameterValidator = new ProfileParameterValidator<{
        test: string;
      }>(ast, 'input', 'Test');

      it('should pass with correct type', () => {
        expect(parameterValidator.validate({ test: 'hello' })).toEqual(true);
      });

      it('should fail with incorrect type', () => {
        expect(() => parameterValidator.validate({ test: 7 } as any)).toThrow(
          '[input.test] Wrong type: expected string, but got number'
        );
      });

      it('should fail with missing field', () => {
        expect(() => parameterValidator.validate({} as any)).toThrow(
          '[input.test] Missing required field'
        );
      });
    });

    describe('AST with multiple input props', () => {
      const ast: ProfileDocumentNode = {
        kind: 'ProfileDocument',
        profile: {
          kind: 'Profile',
          profileId: {
            kind: 'ProfileId',
            profileId: 'whatever',
          },
        },
        definitions: [
          {
            kind: 'UseCaseDefinition',
            useCaseName: 'Test',
            input: {
              kind: 'ObjectDefinition',
              fields: [
                {
                  kind: 'FieldDefinition',
                  fieldName: 'test',
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
                  fieldName: 'untyped',
                },
                {
                  kind: 'FieldDefinition',
                  fieldName: 'another',
                  type: {
                    kind: 'PrimitiveTypeName',
                    name: 'number',
                  },
                },
              ],
            },
          },
        ],
      };
      const parameterValidator = new ProfileParameterValidator<{
        test: string;
        untyped?: unknown;
        another?: number;
      }>(ast, 'input', 'Test');

      it('should pass with valid input', () => {
        expect(parameterValidator.validate({ test: 'hello' })).toEqual(true);
        expect(
          parameterValidator.validate({ test: 'hello', untyped: 'hello' })
        ).toEqual(true);
        expect(
          parameterValidator.validate({ test: 'hello', another: 7 })
        ).toEqual(true);
        expect(
          parameterValidator.validate({
            test: 'hello',
            untyped: false,
            another: 7,
          })
        ).toEqual(true);
      });

      it('should fail with invalid input', () => {
        expect(() => parameterValidator.validate({} as any)).toThrow(
          '[input.test] Missing required field'
        );
        expect(() => parameterValidator.validate({ test: 7 } as any)).toThrow(
          '[input.test] Wrong type: expected string, but got number'
        );
        expect(() =>
          parameterValidator.validate({ test: 7, another: 'hello' } as any)
        ).toThrow(
          '[input.test] Wrong type: expected string, but got number\n[input.another] Wrong type: expected number, but got string'
        );
        expect(() =>
          parameterValidator.validate({
            test: 'hello',
            another: 'hello',
          } as any)
        ).toThrow(
          '[input.another] Wrong type: expected number, but got string'
        );
      });
    });

    describe('AST with predefined field', () => {
      const ast: ProfileDocumentNode = {
        kind: 'ProfileDocument',
        profile: {
          kind: 'Profile',
          profileId: {
            kind: 'ProfileId',
            profileId: 'whatever',
          },
        },
        definitions: [
          {
            kind: 'UseCaseDefinition',
            useCaseName: 'Test',
            input: {
              kind: 'ObjectDefinition',
              fields: [
                {
                  kind: 'FieldDefinition',
                  fieldName: 'test',
                },
              ],
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
      const parameterValidator = new ProfileParameterValidator<{
        test?: string;
      }>(ast, 'input', 'Test');

      it('should pass with valid input', () => {
        expect(parameterValidator.validate({})).toEqual(true);
        expect(parameterValidator.validate({ test: 'hello' })).toEqual(true);
      });

      it('should fail with invalid input', () => {
        expect(() => parameterValidator.validate({ test: 7 } as any)).toThrow(
          '[input.test] Wrong type: expected string, but got number'
        );
      });
    });

    describe('AST with an enum', () => {
      const ast: ProfileDocumentNode = {
        kind: 'ProfileDocument',
        profile: {
          kind: 'Profile',
          profileId: {
            kind: 'ProfileId',
            profileId: 'whatever',
          },
        },
        definitions: [
          {
            kind: 'UseCaseDefinition',
            useCaseName: 'Test',
            input: {
              kind: 'ObjectDefinition',
              fields: [
                {
                  kind: 'FieldDefinition',
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
        ],
      };
      const parameterValidator = new ProfileParameterValidator<{
        test?: 'hello' | 'goodbye';
      }>(ast, 'input', 'Test');

      it('should pass with valid input', () => {
        expect(parameterValidator.validate({ test: 'hello' })).toEqual(true);
      });

      it('should fail with invalid input', () => {
        expect(() =>
          parameterValidator.validate({ test: 'none of your business' } as any)
        ).toThrow('[input.test] Invalid enum value');
        expect(() => parameterValidator.validate({ test: 7 } as any)).toThrow(
          '[input.test] Invalid enum value'
        );
      });
    });

    describe('AST with predefined enum', () => {
      const ast: ProfileDocumentNode = {
        kind: 'ProfileDocument',
        profile: {
          kind: 'Profile',
          profileId: {
            kind: 'ProfileId',
            profileId: 'whatever',
          },
        },
        definitions: [
          {
            kind: 'UseCaseDefinition',
            useCaseName: 'Test',
            input: {
              kind: 'ObjectDefinition',
              fields: [
                {
                  kind: 'FieldDefinition',
                  fieldName: 'test',
                },
              ],
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
      const parameterValidator = new ProfileParameterValidator<{
        test?: 'hello' | 'goodbye';
      }>(ast, 'input', 'Test');

      it('should pass with valid input', () => {
        expect(parameterValidator.validate({ test: 'hello' })).toEqual(true);
      });

      it('should fail with invalid input', () => {
        expect(() =>
          parameterValidator.validate({ test: 'none of your business' } as any)
        ).toThrow('[input.test] Invalid enum value');
        expect(() => parameterValidator.validate({ test: 7 } as any)).toThrow(
          '[input.test] Invalid enum value'
        );
      });
    });

    describe('AST with object', () => {
      const ast: ProfileDocumentNode = {
        kind: 'ProfileDocument',
        profile: {
          kind: 'Profile',
          profileId: {
            kind: 'ProfileId',
            profileId: 'whatever',
          },
        },
        definitions: [
          {
            kind: 'UseCaseDefinition',
            useCaseName: 'Test',
            input: {
              kind: 'ObjectDefinition',
              fields: [
                {
                  kind: 'FieldDefinition',
                  fieldName: 'test',
                  type: {
                    kind: 'ObjectDefinition',
                    fields: [
                      {
                        kind: 'FieldDefinition',
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
        ],
      };
      const parameterValidator = new ProfileParameterValidator<{
        test?: { hello: string };
      }>(ast, 'input', 'Test');

      it('should pass with valid input', () => {
        expect(
          parameterValidator.validate({ test: { hello: 'world!' } })
        ).toEqual(true);
      });

      it('should fail with invalid input', () => {
        expect(() =>
          parameterValidator.validate({ test: 'hello!' } as any)
        ).toThrow('[input.test] Wrong type: expected object, but got string');
        expect(() => parameterValidator.validate({ test: {} } as any)).toThrow(
          '[input.test.hello] Missing required field'
        );
        expect(() =>
          parameterValidator.validate({ test: { hello: 7 } } as any)
        ).toThrow(
          '[input.test.hello] Wrong type: expected string, but got number'
        );
      });
    });

    describe('AST with nested object', () => {
      const ast: ProfileDocumentNode = {
        kind: 'ProfileDocument',
        profile: {
          kind: 'Profile',
          profileId: {
            kind: 'ProfileId',
            profileId: 'whatever',
          },
        },
        definitions: [
          {
            kind: 'UseCaseDefinition',
            useCaseName: 'Test',
            input: {
              kind: 'ObjectDefinition',
              fields: [
                {
                  kind: 'FieldDefinition',
                  fieldName: 'test',
                  type: {
                    kind: 'ObjectDefinition',
                    fields: [
                      {
                        kind: 'FieldDefinition',
                        fieldName: 'hello',
                        type: {
                          kind: 'ObjectDefinition',
                          fields: [
                            {
                              kind: 'FieldDefinition',
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
        ],
      };
      const parameterValidator = new ProfileParameterValidator<{
        test?: { hello?: { goodbye?: boolean } };
      }>(ast, 'input', 'Test');

      it('should pass with valid input', () => {
        expect(parameterValidator.validate({})).toEqual(true);
        expect(parameterValidator.validate({ test: {} })).toEqual(true);
        expect(parameterValidator.validate({ test: { hello: {} } })).toEqual(
          true
        );
        expect(
          parameterValidator.validate({ test: { hello: { goodbye: false } } })
        ).toEqual(true);
      });

      it('should fail with invalid input', () => {
        expect(() => parameterValidator.validate('hello!' as any)).toThrow(
          '[input] Wrong type: expected object, but got string'
        );
        expect(() =>
          parameterValidator.validate({ test: 'hello!' } as any)
        ).toThrow('[input.test] Wrong type: expected object, but got string');
        expect(() =>
          parameterValidator.validate({ test: { hello: 'goodbye!' } } as any)
        ).toThrow(
          '[input.test.hello] Wrong type: expected object, but got string'
        );
        expect(() =>
          parameterValidator.validate({
            test: { hello: { goodbye: 'true' } },
          } as any)
        ).toThrow(
          '[input.test.hello.goodbye] Wrong type: expected boolean, but got string'
        );
      });
    });

    describe('AST with predefined object', () => {
      const ast: ProfileDocumentNode = {
        kind: 'ProfileDocument',
        profile: {
          kind: 'Profile',
          profileId: {
            kind: 'ProfileId',
            profileId: 'whatever',
          },
        },
        definitions: [
          {
            kind: 'UseCaseDefinition',
            useCaseName: 'Test',
            input: {
              kind: 'ObjectDefinition',
              fields: [
                {
                  kind: 'FieldDefinition',
                  fieldName: 'test',
                },
              ],
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
      const parameterValidator = new ProfileParameterValidator<{
        test: { hello: string };
      }>(ast, 'input', 'Test');

      it('should pass with valid input', () => {
        expect(
          parameterValidator.validate({ test: { hello: 'world!' } })
        ).toEqual(true);
      });

      it('should fail with invalid input', () => {
        expect(() =>
          parameterValidator.validate({ test: 'hello!' } as any)
        ).toThrow('[input.test] Wrong type: expected object, but got string');
        expect(() => parameterValidator.validate({ test: {} } as any)).toThrow(
          '[input.test.hello] Missing required field'
        );
        expect(() =>
          parameterValidator.validate({ test: { hello: 7 } } as any)
        ).toThrow(
          '[input.test.hello] Wrong type: expected string, but got number'
        );
      });
    });

    describe('AST with union', () => {
      const ast: ProfileDocumentNode = {
        kind: 'ProfileDocument',
        profile: {
          kind: 'Profile',
          profileId: {
            kind: 'ProfileId',
            profileId: 'whatever',
          },
        },
        definitions: [
          {
            kind: 'UseCaseDefinition',
            useCaseName: 'Test',
            input: {
              kind: 'ObjectDefinition',
              fields: [
                {
                  kind: 'FieldDefinition',
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
        ],
      };
      const parameterValidator = new ProfileParameterValidator<{
        test?: string | number;
      }>(ast, 'input', 'Test');

      it('should pass with valid input', () => {
        expect(parameterValidator.validate({})).toEqual(true);
        expect(parameterValidator.validate({ test: 'hello' })).toEqual(true);
        expect(parameterValidator.validate({ test: 7 })).toEqual(true);
      });

      it('should fail with invalid input', () => {
        expect(() =>
          parameterValidator.validate({ test: true } as any)
        ).toThrow(
          '[input.test] Result does not satisfy union: expected one of: string, number'
        );
      });
    });

    describe('AST with predefined non-nullable union', () => {
      const ast: ProfileDocumentNode = {
        kind: 'ProfileDocument',
        profile: {
          kind: 'Profile',
          profileId: {
            kind: 'ProfileId',
            profileId: 'whatever',
          },
        },
        definitions: [
          {
            kind: 'UseCaseDefinition',
            useCaseName: 'Test',
            input: {
              kind: 'ObjectDefinition',
              fields: [
                {
                  kind: 'FieldDefinition',
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
      const parameterValidator = new ProfileParameterValidator<{
        test: string | number;
      }>(ast, 'input', 'Test');

      it('should pass with valid input', () => {
        expect(parameterValidator.validate({ test: 'hello' })).toEqual(true);
        expect(parameterValidator.validate({ test: 7 })).toEqual(true);
      });

      it('should fail with invalid input', () => {
        expect(() => parameterValidator.validate({} as any)).toThrow(
          '[input.test] Missing required field'
        );
        expect(() =>
          parameterValidator.validate({ test: true } as any)
        ).toThrow(
          '[input.test] Result does not satisfy union: expected one of: string, number'
        );
      });
    });

    describe('AST with string array', () => {
      const ast: ProfileDocumentNode = {
        kind: 'ProfileDocument',
        profile: {
          kind: 'Profile',
          profileId: {
            kind: 'ProfileId',
            profileId: 'whatever',
          },
        },
        definitions: [
          {
            kind: 'UseCaseDefinition',
            useCaseName: 'Test',
            input: {
              kind: 'ObjectDefinition',
              fields: [
                {
                  kind: 'FieldDefinition',
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
        ],
      };
      const parameterValidator = new ProfileParameterValidator<{
        test?: string[];
      }>(ast, 'input', 'Test');

      it('should pass with valid input', () => {
        expect(parameterValidator.validate({})).toEqual(true);
        expect(parameterValidator.validate({ test: [] })).toEqual(true);
        expect(parameterValidator.validate({ test: ['hello'] })).toEqual(true);
        expect(
          parameterValidator.validate({ test: ['hello', 'goodbye'] })
        ).toEqual(true);
      });

      it('should fail with invalid input', () => {
        expect(() => parameterValidator.validate({ test: 7 } as any)).toThrow(
          /is not an array/
        );
        expect(() => parameterValidator.validate({ test: [7] } as any)).toThrow(
          /expected string, but got number/
        );
      });
    });

    describe('AST with non-nullable array of nullable items', () => {
      const ast: ProfileDocumentNode = {
        kind: 'ProfileDocument',
        profile: {
          kind: 'Profile',
          profileId: {
            kind: 'ProfileId',
            profileId: 'whatever',
          },
        },
        definitions: [
          {
            kind: 'UseCaseDefinition',
            useCaseName: 'Test',
            input: {
              kind: 'ObjectDefinition',
              fields: [
                {
                  kind: 'FieldDefinition',
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
        ],
      };
      const parameterValidator = new ProfileParameterValidator<{
        test: string[];
      }>(ast, 'input', 'Test');

      it('should pass with valid input', () => {
        expect(parameterValidator.validate({ test: [] })).toEqual(true);
        expect(parameterValidator.validate({ test: ['hello'] })).toEqual(true);
        expect(
          parameterValidator.validate({ test: ['hello', 'goodbye'] })
        ).toEqual(true);
      });

      it('should fail with invalid input', () => {
        expect(() => parameterValidator.validate({} as any)).toThrow(
          '[input.test] Missing required field'
        );
        expect(() => parameterValidator.validate({ test: 7 } as any)).toThrow(
          '[input.test] 7 is not an array'
        );
        expect(() => parameterValidator.validate({ test: [7] } as any)).toThrow(
          '[input.test] Some elements in array do not match criteria:\nWrong type: expected string, but got number'
        );
      });
    });
  });

  describe('Result', () => {
    describe('AST with nested object', () => {
      const ast: ProfileDocumentNode = {
        kind: 'ProfileDocument',
        profile: {
          kind: 'Profile',
          profileId: {
            kind: 'ProfileId',
            profileId: 'whatever',
          },
        },
        definitions: [
          {
            kind: 'UseCaseDefinition',
            useCaseName: 'Test',
            result: {
              kind: 'ObjectDefinition',
              fields: [
                {
                  kind: 'FieldDefinition',
                  fieldName: 'test',
                  type: {
                    kind: 'ObjectDefinition',
                    fields: [
                      {
                        kind: 'FieldDefinition',
                        fieldName: 'hello',
                        type: {
                          kind: 'ObjectDefinition',
                          fields: [
                            {
                              kind: 'FieldDefinition',
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
        ],
      };
      const parameterValidator = new ProfileParameterValidator<{
        test?: { hello?: { goodbye?: boolean } };
      }>(ast, 'result', 'Test');

      it('should pass with valid input', () => {
        expect(parameterValidator.validate({})).toEqual(true);
        expect(parameterValidator.validate({ test: {} })).toEqual(true);
        expect(parameterValidator.validate({ test: { hello: {} } })).toEqual(
          true
        );
        expect(
          parameterValidator.validate({ test: { hello: { goodbye: false } } })
        ).toEqual(true);
      });

      it('should fail with invalid input', () => {
        expect(() => parameterValidator.validate('hello!' as any)).toThrow(
          '[result] Wrong type: expected object, but got string'
        );
        expect(() =>
          parameterValidator.validate({ test: 'hello!' } as any)
        ).toThrow('[result.test] Wrong type: expected object, but got string');
        expect(() =>
          parameterValidator.validate({ test: { hello: 'goodbye!' } } as any)
        ).toThrow(
          '[result.test.hello] Wrong type: expected object, but got string'
        );
        expect(() =>
          parameterValidator.validate({
            test: { hello: { goodbye: 'true' } },
          } as any)
        ).toThrow(
          '[result.test.hello.goodbye] Wrong type: expected boolean, but got string'
        );
      });
    });

    describe('AST with multi-typed Enum', () => {
      const ast: ProfileDocumentNode = {
        kind: 'ProfileDocument',
        profile: {
          kind: 'Profile',
          profileId: {
            kind: 'ProfileId',
            profileId: 'whatever',
          },
        },
        definitions: [
          {
            kind: 'UseCaseDefinition',
            useCaseName: 'Test',
            result: {
              kind: 'ObjectDefinition',
              fields: [
                {
                  kind: 'FieldDefinition',
                  fieldName: 'test',
                  type: {
                    kind: 'ModelTypeName',
                    name: 'TestEnum',
                  },
                },
              ],
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
      const parameterValidator = new ProfileParameterValidator<{
        test?: 7 | true | 'c';
      }>(ast, 'result', 'Test');

      it('should pass with valid input', () => {
        expect(parameterValidator.validate({})).toEqual(true);
        expect(parameterValidator.validate({ test: 7 })).toEqual(true);
        expect(parameterValidator.validate({ test: true })).toEqual(true);
        expect(parameterValidator.validate({ test: 'c' })).toEqual(true);
      });

      it('should fail with invalid input', () => {
        expect(() => parameterValidator.validate({ test: 8 } as any)).toThrow(
          '[result.test] Invalid enum value'
        );
        expect(() =>
          parameterValidator.validate({ test: false } as any)
        ).toThrow('[result.test] Invalid enum value');
        expect(() => parameterValidator.validate({ test: 'd' } as any)).toThrow(
          '[result.test] Invalid enum value'
        );
      });
    });
  });
});
