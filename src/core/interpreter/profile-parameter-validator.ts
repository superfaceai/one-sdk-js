import type {
  ComlinkAssignmentNode,
  ComlinkListLiteralNode,
  ComlinkObjectLiteralNode,
  ComlinkPrimitiveLiteralNode,
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
  ProfileHeaderNode,
  Type,
  UnionDefinitionNode,
  UseCaseDefinitionNode,
  UseCaseExampleNode,
  UseCaseSlotDefinitionNode,
} from '@superfaceai/ast';
import {
  isNamedFieldDefinitionNode,
  isNamedModelDefinitionNode,
} from '@superfaceai/ast';

import type {
  ILogger,
  LogFunction,
  ProfileParameterError,
} from '../../interfaces';
import type { Result } from '../../lib';
import { err, isNone, ok, UnexpectedError } from '../../lib';
import type { ProfileVisitor } from './interfaces';
import type { ValidationError } from './profile-parameter-validator.errors';
import {
  addFieldToErrors,
  formatErrors,
  InputValidationError,
  isWrongTypeError,
  ResultValidationError,
} from './profile-parameter-validator.errors';

const DEBUG_NAMESPACE = 'profile-parameter-validator';

function assertUnreachable(node: never): never;
function assertUnreachable(node: ProfileASTNode): never {
  throw new UnexpectedError(`Invalid Node kind: ${node.kind}`);
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
  private log?: LogFunction;

  constructor(private readonly ast: ProfileASTNode, logger?: ILogger) {
    this.log = logger?.log(DEBUG_NAMESPACE);
  }

  public validate(
    input: unknown,
    kind: ProfileParameterKind,
    usecase: string
  ): Result<undefined, ProfileParameterError | UnexpectedError> {
    try {
      const validator = this.visit(this.ast, kind, usecase);
      const [result, errors] = validator(input);

      if (result !== true) {
        this.log?.(
          `Validation of ${kind} failed with error(s):\n` + formatErrors(errors)
        );

        const error =
          kind === 'input' ? InputValidationError : ResultValidationError;

        return err(new error(errors));
      }

      this.log?.(`Validation of ${kind} succeeded.`);

      return ok(undefined);
    } catch (e) {
      return err(new UnexpectedError('Unknown error from validator', e));
    }
  }

  public visit(
    node: ProfileASTNode,
    kind: ProfileParameterKind,
    usecase: string
  ): ValidationFunction {
    this.log?.('Visiting node:', node.kind);
    switch (node.kind) {
      case 'ComlinkListLiteral':
        return this.visitComlinkListLiteralNode(node, kind, usecase);
      case 'ComlinkObjectLiteral':
        return this.visitComlinkObjectLiteralNode(node, kind, usecase);
      case 'ComlinkPrimitiveLiteral':
        return this.visitComlinkPrimitiveLiteralNode(node, kind, usecase);
      case 'ComlinkAssignment':
        return this.visitComlinkAssignmentNode(node, kind, usecase);
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
      case 'ProfileHeader':
        return this.visitProfileHeaderNode(node, kind, usecase);
      case 'UnionDefinition':
        return this.visitUnionDefinitionNode(node, kind, usecase);
      case 'UseCaseDefinition':
        return this.visitUseCaseDefinitionNode(node, kind, usecase);
      case 'UseCaseSlotDefinition':
        return this.visitUseCaseSlotDefinitionNode(node, kind, usecase);
      case 'UseCaseExample':
        return this.visitUseCaseExampleNode(node, kind, usecase);

      default:
        assertUnreachable(node);
    }
  }

  public visitComlinkListLiteralNode(
    _node: ComlinkListLiteralNode,
    _kind: ProfileParameterKind,
    _usecase: string
  ): never {
    throw new UnexpectedError('Method not implemented.');
  }

  public visitComlinkObjectLiteralNode(
    _node: ComlinkObjectLiteralNode,
    _kind: ProfileParameterKind,
    _usecase: string
  ): never {
    throw new UnexpectedError('Method not implemented.');
  }

  public visitComlinkPrimitiveLiteralNode(
    _node: ComlinkPrimitiveLiteralNode,
    _kind: ProfileParameterKind,
    _usecase: string
  ): never {
    throw new UnexpectedError('Method not implemented.');
  }

  public visitComlinkAssignmentNode(
    _node: ComlinkAssignmentNode,
    _kind: ProfileParameterKind,
    _usecase: string
  ): never {
    throw new UnexpectedError('Method not implemented.');
  }

  public visitEnumDefinitionNode(
    node: EnumDefinitionNode,
    kind: ProfileParameterKind,
    usecase: string
  ): ValidationFunction {
    return (input: unknown): ValidationResult => {
      if (isNone(input)) {
        return [true];
      }

      for (const value of node.values) {
        if (this.visit(value, kind, usecase)(input)[0]) {
          return [true];
        }
      }

      return [
        false,
        [{ kind: 'enumValue', context: { actual: JSON.stringify(input) } }],
      ];
    };
  }

  public visitEnumValueNode(
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

  public visitFieldDefinitionNode(
    node: FieldDefinitionNode,
    kind: ProfileParameterKind,
    usecase: string
  ): ValidationFunction {
    return (input: unknown): ValidationResult => {
      if (objectHasKey(input, node.fieldName)) {
        const fieldValue = objectHasKey(input, node.fieldName)
          ? input[node.fieldName]
          : undefined;

        if (node.type) {
          return this.visit(node.type, kind, usecase)(fieldValue);
        }

        if (this.namedFieldDefinitions[node.fieldName] !== undefined) {
          return this.namedFieldDefinitions[node.fieldName](fieldValue);
        }

        return [true];
      }

      if (node.required) {
        return [false, [{ kind: 'missingRequired' }]];
      } else {
        return [true];
      }
    };
  }

  public visitListDefinitionNode(
    node: ListDefinitionNode,
    kind: ProfileParameterKind,
    usecase: string
  ): ValidationFunction {
    return (input: unknown): ValidationResult => {
      if (isNone(input)) {
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

  public visitModelTypeNameNode(
    node: ModelTypeNameNode,
    _kind: ProfileParameterKind,
    _usecase: string
  ): ValidationFunction {
    if (this.namedModelDefinitions[node.name] !== undefined) {
      return this.namedModelDefinitions[node.name];
    }

    throw new UnexpectedError(`Invalid model name: ${node.name}`);
  }

  public visitNamedFieldDefinitionNode(
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

  public visitNamedModelDefinitionNode(
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

  public visitNonNullDefinitionNode(
    node: NonNullDefinitionNode,
    kind: ProfileParameterKind,
    usecase: string
  ): ValidationFunction {
    return (input: unknown): ValidationResult => {
      if (isNone(input)) {
        return [false, [{ kind: 'nullInNonNullable' }]];
      }

      return this.visit(node.type, kind, usecase)(input);
    };
  }

  public visitObjectDefinitionNode(
    node: ObjectDefinitionNode,
    kind: ProfileParameterKind,
    usecase: string
  ): ValidationFunction {
    return (input: unknown): ValidationResult => {
      if (isNone(input)) {
        return [true];
      }

      if (typeof input !== 'object') {
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

  public visitPrimitiveTypeNameNode(
    node: PrimitiveTypeNameNode,
    _kind: ProfileParameterKind,
    _usecase: string
  ): ValidationFunction {
    return (input: unknown): ValidationResult => {
      if (isNone(input)) {
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

  public visitProfileDocumentNode(
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
      throw new UnexpectedError(`Usecase ${usecase} not found!`);
    }

    if (!this.namedDefinitionsInitialized) {
      node.definitions
        .filter(isNamedModelDefinitionNode)
        .forEach(definition => {
          this.namedModelDefinitions[definition.modelName] = this.visit(
            definition,
            kind,
            usecase
          );
        });

      node.definitions
        .filter(isNamedFieldDefinitionNode)
        .forEach(definition => {
          this.namedFieldDefinitions[definition.fieldName] = this.visit(
            definition,
            kind,
            usecase
          );
        });

      this.namedDefinitionsInitialized = true;
    }

    return this.visit(usecaseNode, kind, usecase);
  }

  public visitProfileHeaderNode(
    _node: ProfileHeaderNode,
    _kind: ProfileParameterKind,
    _usecase: string
  ): ValidationFunction {
    throw new UnexpectedError('Method not implemented.');
  }

  public visitUnionDefinitionNode(
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

  public visitUseCaseDefinitionNode(
    node: UseCaseDefinitionNode,
    kind: ProfileParameterKind,
    usecase: string
  ): ValidationFunction {
    if (kind === 'input' && node.input) {
      return addPath(this.visit(node.input.value, kind, usecase), 'input');
    }

    if (kind === 'result' && node.result) {
      return addPath(this.visit(node.result.value, kind, usecase), 'result');
    }

    return (input: unknown): ValidationResult => {
      if (
        typeof input === 'undefined' ||
        (typeof input === 'object' &&
          (input === null || Object.keys(input).length === 0))
      ) {
        return [true];
      }

      return [false, [{ kind: 'wrongInput' }]];
    };
  }

  public visitUseCaseExampleNode(
    _node: UseCaseExampleNode,
    _kind: ProfileParameterKind,
    _usecase: string
  ): never {
    throw new UnexpectedError('Method not implemented.');
  }

  public visitUseCaseSlotDefinitionNode(
    _node: UseCaseSlotDefinitionNode<Type>,
    _kind: ProfileParameterKind,
    _usecase: string
  ): never {
    throw new UnexpectedError('Method not implemented.');
  }
}
