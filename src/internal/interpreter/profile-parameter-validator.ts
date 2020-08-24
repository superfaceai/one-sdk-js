import {
  EnumDefinitionNode,
  EnumValueNode,
  FieldDefinitionNode,
  ListDefinitionNode,
  ModelTypeNameNode,
  NamedFieldDefinitionNode,
  NamedModelDefinitionNode,
  NonNullDefinitionNode,
  ObjectDefinitionNode,
  PrimitiveTypeNameNode,
  ProfileASTNode,
  ProfileDocumentNode,
  ProfileIdNode,
  ProfileNode,
  UnionDefinitionNode,
  UseCaseDefinitionNode,
} from '@superindustries/language';

import { ProfileVisitor } from './interfaces';

type ErrorContext = { path?: string[] };
type ValidationError =
  | {
      kind: 'wrongInput' | 'enumValue';
      context?: ErrorContext;
    }
  | {
      kind: 'wrongType';
      context: ErrorContext & { expected: string; actual: string };
    }
  | { kind: 'notArray'; context: ErrorContext & { input: unknown } }
  | { kind: 'wrongUnion'; context: ErrorContext & { expected: string[] } }
  | {
      kind: 'elementsInArrayWrong';
      context: ErrorContext & { suberrors: ValidationError[] };
    }
  | {
      kind: 'missingRequired';
      context?: ErrorContext & { field: string };
    };
type ValidationResult = [true] | [false, ValidationError[]];
type ValidationFunction = <T>(input: T) => ValidationResult;

function isWrongTypeError(
  err: ValidationError
): err is {
  kind: 'wrongType';
  context: { expected: string; actual: string };
} {
  return err.kind === 'wrongType';
}

function addFieldToErrors(
  errors: ValidationError[],
  field: string
): ValidationError[] {
  return errors.map(err =>
    err.kind === 'missingRequired'
      ? { ...err, context: { ...err.context, field } }
      : err
  );
}

function addPath(
  validator: ValidationFunction,
  path: string
): ValidationFunction {
  return (input: unknown): ValidationResult => {
    const result = validator(input);
    if (result[0]) {
      return result;
    }

    return [
      false,
      result[1].map(err => {
        return {
          ...err,
          context: {
            ...(err.context ?? {}),
            path: [path, ...(err.context?.path ?? [])],
          },
        } as ValidationError;
      }),
    ];
  };
}

function assertUnreachable(node: never): never;
function assertUnreachable(node: ProfileASTNode): never {
  throw new Error(`Invalid Node kind: ${node.kind}`);
}

function objectHasKey<K extends string>(
  obj: unknown,
  key: K
): obj is Record<K, unknown> {
  if (typeof obj !== 'object') {
    return false;
  }

  if (obj === null) {
    return false;
  }

  if (!(key in obj)) {
    return false;
  }

  return true;
}

function formatErrors(errors?: ValidationError[]): string {
  if (!errors) {
    return 'Unknown error';
  }

  return errors
    .map(err => {
      const prefix = err.context?.path
        ? `[${err.context.path.join('.')}] `
        : '';
      switch (err.kind) {
        case 'wrongType':
          return `${prefix}Wrong type: expected ${err.context.expected}, but got ${err.context.actual}`;

        case 'notArray':
          return `${prefix}${JSON.stringify(
            err.context.input
          )} is not an array`;

        case 'missingRequired':
          return `${prefix}Missing required field`;

        case 'wrongUnion':
          return `${prefix}Result does not satisfy union: expected one of: ${err.context.expected.join(
            ', '
          )}`;

        case 'elementsInArrayWrong':
          return `${prefix}Some elements in array do not match criteria:\n${formatErrors(
            err.context.suberrors
          )}`;

        case 'enumValue':
          return `${prefix}Invalid enum value`;

        default:
          throw new Error('Invalid error!');
      }
    })
    .join('\n');
}

export class ProfileParameterValidator<T> implements ProfileVisitor {
  private namedFieldDefinitions: Record<string, ValidationFunction> = {};
  private namedModelDefinitions: Record<string, ValidationFunction> = {};

  constructor(
    private readonly ast: ProfileASTNode,
    private readonly kind: 'input' | 'result',
    private readonly usecase: string
  ) {}

  validate(input: T): input is T {
    const validator = this.visit(this.ast);
    const [result, errors] = validator(input);

    if (result === true) {
      return true;
    } else {
      throw new Error(formatErrors(errors));
    }
  }

  visit(node: ProfileASTNode): ValidationFunction {
    switch (node.kind) {
      case 'EnumDefinition':
        return this.visitEnumDefinitionNode(node);
      case 'EnumValue':
        return this.visitEnumValueNode(node);
      case 'FieldDefinition':
        return this.visitFieldDefinitionNode(node);
      case 'ListDefinition':
        return this.visitListDefinitionNode(node);
      case 'ModelTypeName':
        return this.visitModelTypeNameNode(node);
      case 'NamedFieldDefinition':
        return this.visitNamedFieldDefinitionNode(node);
      case 'NamedModelDefinition':
        return this.visitNamedModelDefinitionNode(node);
      case 'NonNullDefinition':
        return this.visitNonNullDefinitionNode(node);
      case 'ObjectDefinition':
        return this.visitObjectDefinitionNode(node);
      case 'PrimitiveTypeName':
        return this.visitPrimitiveTypeNameNode(node);
      case 'ProfileDocument':
        return this.visitProfileDocumentNode(node);
      case 'ProfileId':
        return this.visitProfileIdNode(node);
      case 'Profile':
        return this.visitProfileNode(node);
      case 'UnionDefinition':
        return this.visitUnionDefinitionNode(node);
      case 'UseCaseDefinition':
        return this.visitUseCaseDefinitionNode(node);

      default:
        assertUnreachable(node);
    }
  }

  visitEnumDefinitionNode(node: EnumDefinitionNode): ValidationFunction {
    return (input: unknown): ValidationResult => {
      if (input === undefined) {
        return [true];
      }

      for (const value of node.values) {
        if (this.visit(value)(input)[0]) {
          return [true];
        }
      }

      return [false, [{ kind: 'enumValue' }]];
    };
  }

  visitEnumValueNode(node: EnumValueNode): ValidationFunction {
    return (input: unknown): ValidationResult => {
      if (input === node.value) {
        return [true];
      } else {
        return [false, []];
      }
    };
  }

  visitFieldDefinitionNode(node: FieldDefinitionNode): ValidationFunction {
    return (input: unknown): ValidationResult => {
      const field = objectHasKey(input, node.fieldName)
        ? input[node.fieldName]
        : undefined;

      if (!node.type) {
        if (this.namedFieldDefinitions[node.fieldName]) {
          return this.namedFieldDefinitions[node.fieldName](field);
        }

        return [true];
      }

      return this.visit(node.type)(field);
    };
  }

  visitListDefinitionNode(node: ListDefinitionNode): ValidationFunction {
    return (input: unknown): ValidationResult => {
      if (input === undefined) {
        return [true];
      }

      if (!Array.isArray(input)) {
        return [false, [{ kind: 'notArray', context: { input } }]];
      }

      const errors: ValidationError[] = [];

      const result = input.every(item => {
        const result = this.visit(node.elementType)(item);

        if (result[1]) {
          errors.push(...result[1]);
        }

        return result[0];
      });

      if (result) {
        return [true];
      } else {
        return [
          false,
          [
            {
              kind: 'elementsInArrayWrong',
              context: { suberrors: errors },
            },
          ],
        ];
      }
    };
  }

  visitModelTypeNameNode(node: ModelTypeNameNode): ValidationFunction {
    if (this.namedModelDefinitions[node.name]) {
      return this.namedModelDefinitions[node.name];
    }

    throw new Error(`Invalid model name: ${node.name}`);
  }

  visitNamedFieldDefinitionNode(
    node: NamedFieldDefinitionNode
  ): ValidationFunction {
    if (node.type) {
      return this.visit(node.type);
    } else {
      return (): ValidationResult => [true];
    }
  }

  visitNamedModelDefinitionNode(
    node: NamedModelDefinitionNode
  ): ValidationFunction {
    if (node.type) {
      return this.visit(node.type);
    } else {
      return (): ValidationResult => [true];
    }
  }

  visitNonNullDefinitionNode(node: NonNullDefinitionNode): ValidationFunction {
    return (input: unknown): ValidationResult => {
      if (input === undefined) {
        return [false, [{ kind: 'missingRequired' }]];
      }

      return this.visit(node.type)(input);
    };
  }

  visitObjectDefinitionNode(node: ObjectDefinitionNode): ValidationFunction {
    return (input: unknown): ValidationResult => {
      if (input === undefined) {
        return [true];
      }

      if (typeof input !== 'object' || input === null) {
        return [
          false,
          [
            {
              kind: 'wrongType',
              context: { expected: 'object', actual: typeof input },
            },
          ],
        ];
      }

      return node.fields.reduce<ValidationResult>(
        (result, field) => {
          const subresult = addPath(this.visit(field), field.fieldName)(input);

          if (subresult[0] === false) {
            if (result[1]) {
              return [
                false,
                [
                  ...result[1],
                  ...addFieldToErrors(subresult[1], field.fieldName),
                ],
              ];
            } else {
              return [false, addFieldToErrors(subresult[1], field.fieldName)];
            }
          }

          return result;
        },
        [true]
      );
    };
  }

  visitPrimitiveTypeNameNode(node: PrimitiveTypeNameNode): ValidationFunction {
    return (input: unknown): ValidationResult => {
      if (input === undefined) {
        return [true];
      }

      switch (node.name) {
        case 'boolean':
          if (typeof input === 'boolean') {
            return [true];
          } else {
            return [
              false,
              [
                {
                  kind: 'wrongType',
                  context: { expected: 'boolean', actual: typeof input },
                },
              ],
            ];
          }

        case 'number':
          if (typeof input === 'number') {
            return [true];
          } else {
            return [
              false,
              [
                {
                  kind: 'wrongType',
                  context: { expected: 'number', actual: typeof input },
                },
              ],
            ];
          }

        case 'string':
          if (typeof input === 'string') {
            return [true];
          } else {
            return [
              false,
              [
                {
                  kind: 'wrongType',
                  context: { expected: 'string', actual: typeof input },
                },
              ],
            ];
          }
      }
    };
  }

  visitProfileDocumentNode(node: ProfileDocumentNode): ValidationFunction {
    const usecaseNode = node.definitions.find(
      definition =>
        definition.kind === 'UseCaseDefinition' &&
        definition.useCaseName === this.usecase
    );

    if (!usecaseNode) {
      throw new Error(`Usecase ${this.usecase} not found!`);
    }

    node.definitions
      .filter(
        (definition): definition is NamedFieldDefinitionNode =>
          definition.kind === 'NamedFieldDefinition'
      )
      .forEach(
        definition =>
          (this.namedFieldDefinitions[definition.fieldName] = this.visit(
            definition
          ))
      );

    node.definitions
      .filter(
        (definition): definition is NamedModelDefinitionNode =>
          definition.kind === 'NamedModelDefinition'
      )
      .forEach(
        definition =>
          (this.namedModelDefinitions[definition.modelName] = this.visit(
            definition
          ))
      );

    return this.visit(usecaseNode);
  }

  visitProfileIdNode(_node: ProfileIdNode): ValidationFunction {
    throw new Error('Method not implemented.');
  }

  visitProfileNode(_node: ProfileNode): ValidationFunction {
    throw new Error('Method not implemented.');
  }

  visitUnionDefinitionNode(node: UnionDefinitionNode): ValidationFunction {
    return (input: unknown): ValidationResult => {
      const errors: ValidationError[] = [];

      for (const type of node.types) {
        const result = this.visit(type)(input);
        if (result[0]) {
          return [true];
        } else {
          errors.push(...result[1]);
        }
      }

      const types = errors
        .filter(isWrongTypeError)
        .map(err => err.context.expected);

      return [false, [{ kind: 'wrongUnion', context: { expected: types } }]];
    };
  }

  visitUseCaseDefinitionNode(node: UseCaseDefinitionNode): ValidationFunction {
    if (this.kind === 'input' && node.input) {
      return addPath(this.visit(node.input), 'input');
    } else if (this.kind === 'result' && node.result) {
      return addPath(this.visit(node.result), 'result');
    }

    return (input: unknown): ValidationResult => {
      if (
        typeof input === undefined ||
        (typeof input === 'object' && input === {})
      ) {
        return [true];
      }

      return [false, [{ kind: 'wrongInput' }]];
    };
  }
}
