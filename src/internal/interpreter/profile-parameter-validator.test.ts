import { ProfileDocumentNode } from '@superfaceai/language';

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
              kind: 'UseCaseSlotDefinition',
              type: {
                kind: 'ObjectDefinition',
                fields: [],
              },
            },
          },
        ],
      };
      const parameterValidator = new ProfileParameterValidator(ast);

      it('should pass with empty input', () => {
        expect(() =>
          parameterValidator.validate({}, 'input', 'Test')
        ).not.toThrow();
      });

      it('should pass with unused input', () => {
        expect(() =>
          parameterValidator.validate({ extra: 'input' }, 'input', 'Test')
        ).not.toThrow();
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
              kind: 'UseCaseSlotDefinition',
              type: {
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
        expect(() =>
          parameterValidator.validate({ test: 'hello' }, 'input', 'Test')
        ).not.toThrow();
        expect(() =>
          parameterValidator.validate({}, 'input', 'Test')
        ).not.toThrow();
      });

      it('should pass with unused input', () => {
        expect(() =>
          parameterValidator.validate(
            {
              test: 'hello',
              another: 'input',
            } as any,
            'input',
            'Test'
          )
        ).not.toThrow();
        expect(() =>
          parameterValidator.validate(
            { another: 'input' } as any,
            'input',
            'Test'
          )
        ).not.toThrow();
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
              kind: 'UseCaseSlotDefinition',
              type: {
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
        expect(() =>
          parameterValidator.validate({}, 'input', 'Test')
        ).not.toThrow();
      });

      it('should pass with correct input type', () => {
        expect(() =>
          parameterValidator.validate({ test: 'hello' }, 'input', 'Test')
        ).not.toThrow();
      });

      it('should fail with incorrect type', () => {
        expect(() =>
          parameterValidator.validate({ test: 7 } as any, 'input', 'Test')
        ).toThrow('[input.test] Wrong type: expected string, but got number');
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
              kind: 'UseCaseSlotDefinition',
              type: {
                kind: 'ObjectDefinition',
                fields: [
                  {
                    kind: 'FieldDefinition',
                    fieldName: 'test',
                    required: false,
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
        expect(() =>
          parameterValidator.validate({ test: 'hello' }, 'input', 'Test')
        ).not.toThrow();
      });

      it('should fail with incorrect type', () => {
        expect(() =>
          parameterValidator.validate({ test: 7 } as any, 'input', 'Test')
        ).toThrow('[input.test] Wrong type: expected string, but got number');
      });

      it('should fail with missing field', () => {
        expect(() =>
          parameterValidator.validate({} as any, 'input', 'Test')
        ).toThrow('[input.test] Missing required field');
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
              kind: 'UseCaseSlotDefinition',
              type: {
                kind: 'ObjectDefinition',
                fields: [
                  {
                    kind: 'FieldDefinition',
                    fieldName: 'test',
                    required: false,
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
        expect(() =>
          parameterValidator.validate({ test: 'hello' }, 'input', 'Test')
        ).not.toThrow();
        expect(() =>
          parameterValidator.validate(
            { test: 'hello', untyped: 'hello' },
            'input',
            'Test'
          )
        ).not.toThrow();
        expect(() =>
          parameterValidator.validate(
            { test: 'hello', another: 7 },
            'input',
            'Test'
          )
        ).not.toThrow();
        expect(() =>
          parameterValidator.validate(
            {
              test: 'hello',
              untyped: false,
              another: 7,
            },
            'input',
            'Test'
          )
        ).not.toThrow();
      });

      it('should fail with invalid input', () => {
        expect(() =>
          parameterValidator.validate({} as any, 'input', 'Test')
        ).toThrow('[input.test] Missing required field');
        expect(() =>
          parameterValidator.validate({ test: 7 } as any, 'input', 'Test')
        ).toThrow('[input.test] Wrong type: expected string, but got number');
        expect(() =>
          parameterValidator.validate(
            { test: 7, another: 'hello' } as any,
            'input',
            'Test'
          )
        ).toThrow(
          '[input.test] Wrong type: expected string, but got number\n[input.another] Wrong type: expected number, but got string'
        );
        expect(() =>
          parameterValidator.validate(
            {
              test: 'hello',
              another: 'hello',
            } as any,
            'input',
            'Test'
          )
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
              kind: 'UseCaseSlotDefinition',
              type: {
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
        expect(() =>
          parameterValidator.validate({}, 'input', 'Test')
        ).not.toThrow();
        expect(() =>
          parameterValidator.validate({ test: 'hello' }, 'input', 'Test')
        ).not.toThrow();
      });

      it('should fail with invalid input', () => {
        expect(() =>
          parameterValidator.validate({ test: 7 } as any, 'input', 'Test')
        ).toThrow('[input.test] Wrong type: expected string, but got number');
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
              kind: 'UseCaseSlotDefinition',
              type: {
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
        expect(() =>
          parameterValidator.validate({ test: 'hello' }, 'input', 'Test')
        ).not.toThrow();
      });

      it('should fail with invalid input', () => {
        expect(() =>
          parameterValidator.validate(
            { test: 'none of your business' } as any,
            'input',
            'Test'
          )
        ).toThrow('[input.test] Invalid enum value');
        expect(() =>
          parameterValidator.validate({ test: 7 } as any, 'input', 'Test')
        ).toThrow('[input.test] Invalid enum value');
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
              kind: 'UseCaseSlotDefinition',
              type: {
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
        expect(() =>
          parameterValidator.validate({ test: 'hello' }, 'input', 'Test')
        ).not.toThrow();
      });

      it('should fail with invalid input', () => {
        expect(() =>
          parameterValidator.validate(
            { test: 'none of your business' } as any,
            'input',
            'Test'
          )
        ).toThrow('[input.test] Invalid enum value');
        expect(() =>
          parameterValidator.validate({ test: 7 } as any, 'input', 'Test')
        ).toThrow('[input.test] Invalid enum value');
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
              kind: 'UseCaseSlotDefinition',
              type: {
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
        expect(() =>
          parameterValidator.validate(
            { test: { hello: 'world!' } },
            'input',
            'Test'
          )
        ).not.toThrow();
      });

      it('should fail with invalid input', () => {
        expect(() =>
          parameterValidator.validate(
            { test: 'hello!' } as any,
            'input',
            'Test'
          )
        ).toThrow('[input.test] Wrong type: expected object, but got string');
        expect(() =>
          parameterValidator.validate({ test: {} } as any, 'input', 'Test')
        ).toThrow('[input.test.hello] Missing required field');
        expect(() =>
          parameterValidator.validate(
            { test: { hello: 7 } } as any,
            'input',
            'Test'
          )
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
              kind: 'UseCaseSlotDefinition',
              type: {
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
        expect(() =>
          parameterValidator.validate({}, 'input', 'Test')
        ).not.toThrow();
        expect(() =>
          parameterValidator.validate({ test: {} }, 'input', 'Test')
        ).not.toThrow();
        expect(() =>
          parameterValidator.validate({ test: { hello: {} } }, 'input', 'Test')
        ).not.toThrow();
        expect(() =>
          parameterValidator.validate(
            { test: { hello: { goodbye: false } } },
            'input',
            'Test'
          )
        ).not.toThrow();
      });

      it('should fail with invalid input', () => {
        expect(() =>
          parameterValidator.validate('hello!' as any, 'input', 'Test')
        ).toThrow('[input] Wrong type: expected object, but got string');
        expect(() =>
          parameterValidator.validate(
            { test: 'hello!' } as any,
            'input',
            'Test'
          )
        ).toThrow('[input.test] Wrong type: expected object, but got string');
        expect(() =>
          parameterValidator.validate(
            { test: { hello: 'goodbye!' } } as any,
            'input',
            'Test'
          )
        ).toThrow(
          '[input.test.hello] Wrong type: expected object, but got string'
        );
        expect(() =>
          parameterValidator.validate(
            {
              test: { hello: { goodbye: 'true' } },
            } as any,
            'input',
            'Test'
          )
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
              kind: 'UseCaseSlotDefinition',
              type: {
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
                  required: false,
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
        expect(() =>
          parameterValidator.validate(
            { test: { hello: 'world!' } },
            'input',
            'Test'
          )
        ).not.toThrow();
      });

      it('should fail with invalid input', () => {
        expect(() =>
          parameterValidator.validate(
            { test: 'hello!' } as any,
            'input',
            'Test'
          )
        ).toThrow('[input.test] Wrong type: expected object, but got string');
        expect(() =>
          parameterValidator.validate({ test: {} } as any, 'input', 'Test')
        ).toThrow('[input.test.hello] Missing required field');
        expect(() =>
          parameterValidator.validate(
            { test: { hello: 7 } } as any,
            'input',
            'Test'
          )
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
              kind: 'UseCaseSlotDefinition',
              type: {
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
        expect(() =>
          parameterValidator.validate({}, 'input', 'Test')
        ).not.toThrow();
        expect(() =>
          parameterValidator.validate({ test: 'hello' }, 'input', 'Test')
        ).not.toThrow();
        expect(() =>
          parameterValidator.validate({ test: 7 }, 'input', 'Test')
        ).not.toThrow();
      });

      it('should fail with invalid input', () => {
        expect(() =>
          parameterValidator.validate({ test: true } as any, 'input', 'Test')
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
              kind: 'UseCaseSlotDefinition',
              type: {
                kind: 'ObjectDefinition',
                fields: [
                  {
                    kind: 'FieldDefinition',
                    required: false,
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
        expect(() =>
          parameterValidator.validate({ test: 'hello' }, 'input', 'Test')
        ).not.toThrow();
        expect(() =>
          parameterValidator.validate({ test: 7 }, 'input', 'Test')
        ).not.toThrow();
      });

      it('should fail with invalid input', () => {
        expect(() =>
          parameterValidator.validate({} as any, 'input', 'Test')
        ).toThrow('[input.test] Missing required field');
        expect(() =>
          parameterValidator.validate({ test: true } as any, 'input', 'Test')
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
              kind: 'UseCaseSlotDefinition',
              type: {
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
        expect(() =>
          parameterValidator.validate({}, 'input', 'Test')
        ).not.toThrow();
        expect(() =>
          parameterValidator.validate({ test: [] }, 'input', 'Test')
        ).not.toThrow();
        expect(() =>
          parameterValidator.validate({ test: ['hello'] }, 'input', 'Test')
        ).not.toThrow();
        expect(() =>
          parameterValidator.validate(
            { test: ['hello', 'goodbye'] },
            'input',
            'Test'
          )
        ).not.toThrow();
      });

      it('should fail with invalid input', () => {
        expect(() =>
          parameterValidator.validate({ test: 7 } as any, 'input', 'Test')
        ).toThrow(/is not an array/);
        expect(() =>
          parameterValidator.validate({ test: [7] } as any, 'input', 'Test')
        ).toThrow(/expected string, but got number/);
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
              kind: 'UseCaseSlotDefinition',
              type: {
                kind: 'ObjectDefinition',
                fields: [
                  {
                    kind: 'FieldDefinition',
                    required: false,
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
        expect(() =>
          parameterValidator.validate({ test: [] }, 'input', 'Test')
        ).not.toThrow();
        expect(() =>
          parameterValidator.validate({ test: ['hello'] }, 'input', 'Test')
        ).not.toThrow();
        expect(() =>
          parameterValidator.validate(
            { test: ['hello', 'goodbye'] },
            'input',
            'Test'
          )
        ).not.toThrow();
      });

      it('should fail with invalid input', () => {
        expect(() =>
          parameterValidator.validate({} as any, 'input', 'Test')
        ).toThrow('[input.test] Missing required field');
        expect(() =>
          parameterValidator.validate({ test: 7 } as any, 'input', 'Test')
        ).toThrow('[input.test] 7 is not an array');
        expect(() =>
          parameterValidator.validate({ test: [7] } as any, 'input', 'Test')
        ).toThrow(
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
              kind: 'UseCaseSlotDefinition',
              type: {
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
        expect(() =>
          parameterValidator.validate({}, 'result', 'Test')
        ).not.toThrow();
        expect(() =>
          parameterValidator.validate({ test: {} }, 'result', 'Test')
        ).not.toThrow();
        expect(() =>
          parameterValidator.validate({ test: { hello: {} } }, 'result', 'Test')
        ).not.toThrow();
        expect(() =>
          parameterValidator.validate(
            { test: { hello: { goodbye: false } } },
            'result',
            'Test'
          )
        ).not.toThrow();
      });

      it('should fail with invalid input', () => {
        expect(() =>
          parameterValidator.validate('hello!' as any, 'result', 'Test')
        ).toThrow('[result] Wrong type: expected object, but got string');
        expect(() =>
          parameterValidator.validate(
            { test: 'hello!' } as any,
            'result',
            'Test'
          )
        ).toThrow('[result.test] Wrong type: expected object, but got string');
        expect(() =>
          parameterValidator.validate(
            { test: { hello: 'goodbye!' } } as any,
            'result',
            'Test'
          )
        ).toThrow(
          '[result.test.hello] Wrong type: expected object, but got string'
        );
        expect(() =>
          parameterValidator.validate(
            {
              test: { hello: { goodbye: 'true' } },
            } as any,
            'result',
            'Test'
          )
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
              kind: 'UseCaseSlotDefinition',
              type: {
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
        expect(() =>
          parameterValidator.validate({}, 'result', 'Test')
        ).not.toThrow();
        expect(() =>
          parameterValidator.validate({ test: 7 }, 'result', 'Test')
        ).not.toThrow();
        expect(() =>
          parameterValidator.validate({ test: true }, 'result', 'Test')
        ).not.toThrow();
        expect(() =>
          parameterValidator.validate({ test: 'c' }, 'result', 'Test')
        ).not.toThrow();
      });

      it('should fail with invalid input', () => {
        expect(() =>
          parameterValidator.validate({ test: 8 } as any, 'result', 'Test')
        ).toThrow('[result.test] Invalid enum value');
        expect(() =>
          parameterValidator.validate({ test: false } as any, 'result', 'Test')
        ).toThrow('[result.test] Invalid enum value');
        expect(() =>
          parameterValidator.validate({ test: 'd' } as any, 'result', 'Test')
        ).toThrow('[result.test] Invalid enum value');
      });
    });
  });
});
