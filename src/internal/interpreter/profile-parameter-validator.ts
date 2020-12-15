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
} from '@superfaceai/ast';
import createDebug from 'debug';

import { err, ok, Result } from '../../lib';
import { ProfileVisitor } from './interfaces';
import {
  addFieldToErrors,
  InputValidationError,
  isWrongTypeError,
  ProfileParameterError,
  ResultValidationError,
  ValidationError,
} from './profile-parameter-validator.errors';

const debug = createDebug('superface:profile-parameter-validator');

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

type ValidationResult = [true] | [false, ValidationError[]];
type ValidationFunction = <T>(input: T) => ValidationResult;
type ProfileParameterKind = 'input' | 'result';

export class ProfileParameterValidator implements ProfileVisitor {
  private namedFieldDefinitions: Record<string, ValidationFunction> = {};
  private namedModelDefinitions: Record<string, ValidationFunction> = {};
  private namedDefinitionsInitialized = false;

  constructor(private readonly ast: ProfileASTNode) {}

  validate(
    input: unknown,
    kind: ProfileParameterKind,
    usecase: string
  ): Result<undefined, ProfileParameterError> {
    const validator = this.visit(this.ast, kind, usecase);
    const [result, errors] = validator(input);

    if (result !== true) {
      const error =
        kind === 'input' ? InputValidationError : ResultValidationError;

      return err(new error(errors));
    }

    return ok(undefined);
  }

  visit(
    node: ProfileASTNode,
    kind: ProfileParameterKind,
    usecase: string
  ): ValidationFunction {
    debug('Visiting node:', node.kind);
    switch (node.kind) {
      case 'EnumDefinition':
        return this.visitEnumDefinitionNode(node, kind, usecase);
      case 'EnumValue':
        return this.visitEnumValueNode(node, kind, usecase);
      case 'FieldDefinition':
        return this.visitFieldDefinitionNode(node, kind, usecase);
      case 'ListDefinition':
        return this.visitListDefinitionNode(node, kind, usecase);
      case 'ModelTypeName':
        return this.visitModelTypeNameNode(node, kind, usecase);
      case 'NamedFieldDefinition':
        return this.visitNamedFieldDefinitionNode(node, kind, usecase);
      case 'NamedModelDefinition':
        return this.visitNamedModelDefinitionNode(node, kind, usecase);
      case 'NonNullDefinition':
        return this.visitNonNullDefinitionNode(node, kind, usecase);
      case 'ObjectDefinition':
        return this.visitObjectDefinitionNode(node, kind, usecase);
      case 'PrimitiveTypeName':
        return this.visitPrimitiveTypeNameNode(node, kind, usecase);
      case 'ProfileDocument':
        return this.visitProfileDocumentNode(node, kind, usecase);
      case 'ProfileId':
        return this.visitProfileIdNode(node, kind, usecase);
      case 'Profile':
        return this.visitProfileNode(node, kind, usecase);
      case 'UnionDefinition':
        return this.visitUnionDefinitionNode(node, kind, usecase);
      case 'UseCaseDefinition':
        return this.visitUseCaseDefinitionNode(node, kind, usecase);
      case 'UseCaseSlotDefinition':
        throw 'TODO';

      default:
        assertUnreachable(node);
    }
  }

  visitEnumDefinitionNode(
    node: EnumDefinitionNode,
    kind: ProfileParameterKind,
    usecase: string
  ): ValidationFunction {
    return (input: unknown): ValidationResult => {
      if (input === undefined) {
        return [true];
      }

      for (const value of node.values) {
        if (this.visit(value, kind, usecase)(input)[0]) {
          return [true];
        }
      }

      return [false, [{ kind: 'enumValue' }]];
    };
  }

  visitEnumValueNode(
    node: EnumValueNode,
    _kind: ProfileParameterKind,
    _usecase: string
  ): ValidationFunction {
    return (input: unknown): ValidationResult => {
      if (input === node.value) {
        return [true];
      } else {
        return [false, []];
      }
    };
  }

  visitFieldDefinitionNode(
    node: FieldDefinitionNode,
    kind: ProfileParameterKind,
    usecase: string
  ): ValidationFunction {
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

      return this.visit(node.type, kind, usecase)(field);
    };
  }

  visitListDefinitionNode(
    node: ListDefinitionNode,
    kind: ProfileParameterKind,
    usecase: string
  ): ValidationFunction {
    return (input: unknown): ValidationResult => {
      if (input === undefined) {
        return [true];
      }

      if (!Array.isArray(input)) {
        return [false, [{ kind: 'notArray', context: { input } }]];
      }

      const errors: ValidationError[] = [];

      const result = input.every(item => {
        const result = this.visit(node.elementType, kind, usecase)(item);

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

  visitModelTypeNameNode(
    node: ModelTypeNameNode,
    _kind: ProfileParameterKind,
    _usecase: string
  ): ValidationFunction {
    if (this.namedModelDefinitions[node.name]) {
      return this.namedModelDefinitions[node.name];
    }

    throw new Error(`Invalid model name: ${node.name}`);
  }

  visitNamedFieldDefinitionNode(
    node: NamedFieldDefinitionNode,
    kind: ProfileParameterKind,
    usecase: string
  ): ValidationFunction {
    if (node.type) {
      return this.visit(node.type, kind, usecase);
    } else {
      return (): ValidationResult => [true];
    }
  }

  visitNamedModelDefinitionNode(
    node: NamedModelDefinitionNode,
    kind: ProfileParameterKind,
    usecase: string
  ): ValidationFunction {
    if (node.type) {
      return this.visit(node.type, kind, usecase);
    } else {
      return (): ValidationResult => [true];
    }
  }

  visitNonNullDefinitionNode(
    node: NonNullDefinitionNode,
    kind: ProfileParameterKind,
    usecase: string
  ): ValidationFunction {
    return (input: unknown): ValidationResult => {
      if (input === undefined) {
        return [false, [{ kind: 'missingRequired' }]];
      }

      return this.visit(node.type, kind, usecase)(input);
    };
  }

  visitObjectDefinitionNode(
    node: ObjectDefinitionNode,
    kind: ProfileParameterKind,
    usecase: string
  ): ValidationFunction {
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
          const subresult = addPath(
            this.visit(field, kind, usecase),
            field.fieldName
          )(input);

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

  visitPrimitiveTypeNameNode(
    node: PrimitiveTypeNameNode,
    _kind: ProfileParameterKind,
    _usecase: string
  ): ValidationFunction {
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

  visitProfileDocumentNode(
    node: ProfileDocumentNode,
    kind: ProfileParameterKind,
    usecase: string
  ): ValidationFunction {
    const usecaseNode = node.definitions.find(
      definition =>
        definition.kind === 'UseCaseDefinition' &&
        definition.useCaseName === usecase
    );

    if (!usecaseNode) {
      throw new Error(`Usecase ${usecase} not found!`);
    }

    if (!this.namedDefinitionsInitialized) {
      node.definitions
        .filter(
          (definition): definition is NamedFieldDefinitionNode =>
            definition.kind === 'NamedFieldDefinition'
        )
        .forEach(
          definition =>
            (this.namedFieldDefinitions[definition.fieldName] = this.visit(
              definition,
              kind,
              usecase
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
              definition,
              kind,
              usecase
            ))
        );

      this.namedDefinitionsInitialized = true;
    }

    return this.visit(usecaseNode, kind, usecase);
  }

  visitProfileIdNode(
    _node: ProfileIdNode,
    _kind: ProfileParameterKind,
    _usecase: string
  ): ValidationFunction {
    throw new Error('Method not implemented.');
  }

  visitProfileNode(
    _node: ProfileNode,
    _kind: ProfileParameterKind,
    _usecase: string
  ): ValidationFunction {
    throw new Error('Method not implemented.');
  }

  visitUnionDefinitionNode(
    node: UnionDefinitionNode,
    kind: ProfileParameterKind,
    usecase: string
  ): ValidationFunction {
    return (input: unknown): ValidationResult => {
      const errors: ValidationError[] = [];

      for (const type of node.types) {
        const result = this.visit(type, kind, usecase)(input);
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

  visitUseCaseDefinitionNode(
    node: UseCaseDefinitionNode,
    kind: ProfileParameterKind,
    usecase: string
  ): ValidationFunction {
    if (kind === 'input' && node.input && node.input.type) {
      return addPath(this.visit(node.input.type, kind, usecase), 'input');
    } else if (kind === 'result' && node.result && node.result.type) {
      return addPath(this.visit(node.result.type, kind, usecase), 'result');
    }

    return (input: unknown): ValidationResult => {
      if (
        typeof input === undefined ||
        (typeof input === 'object' &&
          (input === null || Object.keys(input).length === 0))
      ) {
        return [true];
      }

      return [false, [{ kind: 'wrongInput' }]];
    };
  }
}
