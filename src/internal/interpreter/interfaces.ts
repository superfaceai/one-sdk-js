import {
  EnumDefinitionNode,
  EnumValueNode,
  EvalDefinitionNode,
  FieldDefinitionNode,
  HTTPOperationDefinitionNode,
  IterationDefinitionNode,
  JSExpressionNode,
  ListDefinitionNode,
  MapASTNode,
  MapDefinitionNode,
  MapDocumentNode,
  MapExpressionDefinitionNode,
  MapNode,
  MapProfileIdNode,
  ModelTypeNameNode,
  NamedFieldDefinitionNode,
  NamedModelDefinitionNode,
  NetworkOperationDefinitionNode,
  NonNullDefinitionNode,
  ObjectDefinitionNode,
  OperationCallDefinitionNode,
  OperationDefinitionNode,
  OutcomeDefinitionNode,
  PrimitiveTypeNameNode,
  ProfileASTNode,
  ProfileDocumentNode,
  ProfileIdNode,
  ProfileNode,
  ProviderNode,
  StepDefinitionNode,
  UnionDefinitionNode,
  UseCaseDefinitionNode,
  VariableExpressionDefinitionNode,
} from '@superfaceai/language';

export type Variables = {
  [key: string]: string | Variables | undefined;
};

export interface MapVisitor {
  visit(node: MapASTNode): unknown;
  visitEvalDefinitionNode(node: EvalDefinitionNode): unknown;
  visitHTTPOperationDefinitionNode(node: HTTPOperationDefinitionNode): unknown;
  visitIterationDefinitionNode(node: IterationDefinitionNode): unknown;
  visitJSExpressionNode(node: JSExpressionNode): unknown;
  visitMapDefinitionNode(node: MapDefinitionNode): unknown;
  visitMapDocumentNode(node: MapDocumentNode): unknown;
  visitMapExpressionDefinitionNode(node: MapExpressionDefinitionNode): unknown;
  visitMapNode(node: MapNode): unknown;
  visitNetworkOperationDefinitionNode(
    node: NetworkOperationDefinitionNode
  ): unknown;
  visitOperationCallDefinitionNode(node: OperationCallDefinitionNode): unknown;
  visitOperationDefinitionNode(node: OperationDefinitionNode): unknown;
  visitOutcomeDefinitionNode(node: OutcomeDefinitionNode): unknown;
  visitProfileIdNode(node: MapProfileIdNode): unknown;
  visitProviderNode(node: ProviderNode): unknown;
  visitStepDefinitionNode(node: StepDefinitionNode): unknown;
  visitVariableExpressionDefinitionNode(
    node: VariableExpressionDefinitionNode
  ): unknown;
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
