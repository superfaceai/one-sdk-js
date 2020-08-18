import {
  EvalDefinitionNode,
  HTTPOperationDefinitionNode,
  IterationDefinitionNode,
  JSExpressionNode,
  MapASTNode,
  MapDefinitionNode,
  MapDocumentNode,
  MapExpressionDefinitionNode,
  MapNode,
  MapProfileIdNode,
  NetworkOperationDefinitionNode,
  OperationCallDefinitionNode,
  OperationDefinitionNode,
  OutcomeDefinitionNode,
  ProviderNode,
  StepDefinitionNode,
  VariableExpressionDefinitionNode,
} from '@superindustries/language';

export type Variables = {
  [key: string]: string | Variables | undefined;
};

export interface MapVisitor {
  visit(node: MapASTNode): Promise<unknown> | unknown;
  visitEvalDefinitionNode(node: EvalDefinitionNode): Promise<unknown> | unknown;
  visitHTTPOperationDefinitionNode(
    node: HTTPOperationDefinitionNode
  ): Promise<unknown> | unknown;
  visitIterationDefinitionNode(
    node: IterationDefinitionNode
  ): Promise<unknown> | unknown;
  visitJSExpressionNode(node: JSExpressionNode): Promise<unknown> | unknown;
  visitMapDefinitionNode(node: MapDefinitionNode): Promise<unknown> | unknown;
  visitMapDocumentNode(node: MapDocumentNode): Promise<unknown> | unknown;
  visitMapExpressionDefinitionNode(
    node: MapExpressionDefinitionNode
  ): Promise<unknown> | unknown;
  visitMapNode(node: MapNode): Promise<unknown> | unknown;
  visitNetworkOperationDefinitionNode(
    node: NetworkOperationDefinitionNode
  ): Promise<unknown> | unknown;
  visitOperationCallDefinitionNode(
    node: OperationCallDefinitionNode
  ): Promise<unknown> | unknown;
  visitOperationDefinitionNode(
    node: OperationDefinitionNode
  ): Promise<unknown> | unknown;
  visitOutcomeDefinitionNode(
    node: OutcomeDefinitionNode
  ): Promise<unknown> | unknown;
  visitProfileIdNode(node: MapProfileIdNode): Promise<unknown> | unknown;
  visitProviderNode(node: ProviderNode): Promise<unknown> | unknown;
  visitStepDefinitionNode(node: StepDefinitionNode): Promise<unknown> | unknown;
  visitVariableExpressionDefinitionNode(
    node: VariableExpressionDefinitionNode
  ): Promise<unknown> | unknown;
}
