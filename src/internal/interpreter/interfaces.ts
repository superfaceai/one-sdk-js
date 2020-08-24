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
} from '@superindustries/language';

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
  visit(node: ProfileASTNode): unknown;
  visitEnumDefinitionNode(node: EnumDefinitionNode): unknown;
  visitEnumValueNode(node: EnumValueNode): unknown;
  visitFieldDefinitionNode(node: FieldDefinitionNode): unknown;
  visitListDefinitionNode(node: ListDefinitionNode): unknown;
  visitModelTypeNameNode(node: ModelTypeNameNode): unknown;
  visitNamedFieldDefinitionNode(node: NamedFieldDefinitionNode): unknown;
  visitNamedModelDefinitionNode(node: NamedModelDefinitionNode): unknown;
  visitNonNullDefinitionNode(node: NonNullDefinitionNode): unknown;
  visitObjectDefinitionNode(node: ObjectDefinitionNode): unknown;
  visitPrimitiveTypeNameNode(node: PrimitiveTypeNameNode): unknown;
  visitProfileDocumentNode(node: ProfileDocumentNode): unknown;
  visitProfileIdNode(node: ProfileIdNode): unknown;
  visitProfileNode(node: ProfileNode): unknown;
  visitUnionDefinitionNode(node: UnionDefinitionNode): unknown;
  visitUseCaseDefinitionNode(node: UseCaseDefinitionNode): unknown;
}
