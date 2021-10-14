import {
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
  UnionDefinitionNode,
  UseCaseDefinitionNode,
  UseCaseExampleNode,
  UseCaseSlotDefinitionNode,
} from '@superfaceai/ast';

export interface ProfileVisitor {
  visit(node: ProfileASTNode, ...parameters: unknown[]): unknown;
  visitComlinkListLiteralNode(
    node: ComlinkListLiteralNode,
    ...parameters: unknown[]
  ): unknown;
  visitComlinkObjectLiteralNode(
    node: ComlinkObjectLiteralNode,
    ...parameters: unknown[]
  ): unknown;
  visitComlinkPrimitiveLiteralNode(
    node: ComlinkPrimitiveLiteralNode,
    ...parameters: unknown[]
  ): unknown;
  visitComlinkPrimitiveLiteralNode(
    node: ComlinkPrimitiveLiteralNode,
    ...parameters: unknown[]
  ): unknown;
  visitEnumDefinitionNode(
    node: EnumDefinitionNode,
    ...parameters: unknown[]
  ): unknown;
  visitEnumValueNode(node: EnumValueNode, ...parameters: unknown[]): unknown;
  visitFieldDefinitionNode(
    node: FieldDefinitionNode,
    ...parameters: unknown[]
  ): unknown;
  visitListDefinitionNode(
    node: ListDefinitionNode,
    ...parameters: unknown[]
  ): unknown;
  visitModelTypeNameNode(
    node: ModelTypeNameNode,
    ...parameters: unknown[]
  ): unknown;
  visitNamedFieldDefinitionNode(
    node: NamedFieldDefinitionNode,
    ...parameters: unknown[]
  ): unknown;
  visitNamedModelDefinitionNode(
    node: NamedModelDefinitionNode,
    ...parameters: unknown[]
  ): unknown;
  visitNonNullDefinitionNode(
    node: NonNullDefinitionNode,
    ...parameters: unknown[]
  ): unknown;
  visitObjectDefinitionNode(
    node: ObjectDefinitionNode,
    ...parameters: unknown[]
  ): unknown;
  visitPrimitiveTypeNameNode(
    node: PrimitiveTypeNameNode,
    ...parameters: unknown[]
  ): unknown;
  visitProfileDocumentNode(
    node: ProfileDocumentNode,
    ...parameters: unknown[]
  ): unknown;
  visitProfileHeaderNode(
    node: ProfileHeaderNode,
    ...parameters: unknown[]
  ): unknown;
  visitUnionDefinitionNode(
    node: UnionDefinitionNode,
    ...parameters: unknown[]
  ): unknown;
  visitUseCaseDefinitionNode(
    node: UseCaseDefinitionNode,
    ...parameters: unknown[]
  ): unknown;
  visitUseCaseExampleNode(
    node: UseCaseExampleNode,
    ...parameters: unknown[]
  ): unknown;
  visitUseCaseSlotDefinitionNode(
    node: UseCaseSlotDefinitionNode<ProfileASTNode>,
    ...parameters: unknown[]
  ): unknown;
}
