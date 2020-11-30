import {
  AssignmentNode,
  CallStatementNode,
  EnumDefinitionNode,
  EnumValueNode,
  FieldDefinitionNode,
  HttpCallStatementNode,
  HttpResponseHandlerNode,
  InlineCallNode,
  JessieExpressionNode,
  ListDefinitionNode,
  MapASTNode,
  MapDefinitionNode,
  MapDocumentNode,
  MapNode,
  MapProfileIdNode,
  ModelTypeNameNode,
  NamedFieldDefinitionNode,
  NamedModelDefinitionNode,
  NonNullDefinitionNode,
  ObjectDefinitionNode,
  ObjectLiteralNode,
  OperationDefinitionNode,
  OutcomeStatementNode,
  PrimitiveLiteralNode,
  PrimitiveTypeNameNode,
  ProfileASTNode,
  ProfileDocumentNode,
  ProfileIdNode,
  ProfileNode,
  ProviderNode,
  SetStatementNode,
  StatementConditionNode,
  UnionDefinitionNode,
  UseCaseDefinitionNode,
} from '@superfaceai/ast';

export interface MapVisitor {
  visit(node: MapASTNode): unknown;

  visitPrimitiveLiteralNode(node: PrimitiveLiteralNode): unknown;
  visitObjectLiteralNode(node: ObjectLiteralNode): unknown;
  visitJessieExpressionNode(node: JessieExpressionNode): unknown;
  visitAssignmentNode(node: AssignmentNode): unknown;
  visitStatementConditionNode(node: StatementConditionNode): unknown;
  visitSetStatementNode(node: SetStatementNode): unknown;
  visitCallStatementNode(node: CallStatementNode): unknown;
  visitHttpResponseHandlerNode(node: HttpResponseHandlerNode): unknown;
  visitHttpCallStatementNode(node: HttpCallStatementNode): unknown;
  visitMapDefinitionNode(node: MapDefinitionNode): unknown;
  visitOperationDefinitionNode(node: OperationDefinitionNode): unknown;
  visitOutcomeStatementNode(node: OutcomeStatementNode): unknown;
  visitInlineCallNode(node: InlineCallNode): unknown;
  visitMapProfileIdNode(node: MapProfileIdNode): unknown;
  visitProviderNode(node: ProviderNode): unknown;
  visitMapNode(node: MapNode): unknown;
  visitMapDocumentNode(node: MapDocumentNode): unknown;
}

export interface ProfileVisitor {
  visit(node: ProfileASTNode, ...parameters: unknown[]): unknown;
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
  visitProfileIdNode(node: ProfileIdNode, ...parameters: unknown[]): unknown;
  visitProfileNode(node: ProfileNode, ...parameters: unknown[]): unknown;
  visitUnionDefinitionNode(
    node: UnionDefinitionNode,
    ...parameters: unknown[]
  ): unknown;
  visitUseCaseDefinitionNode(
    node: UseCaseDefinitionNode,
    ...parameters: unknown[]
  ): unknown;
}
