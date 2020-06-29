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
  NetworkOperationDefinitionNode,
  OperationCallDefinitionNode,
  OperationDefinitionNode,
  OutcomeDefinitionNode,
  ProfileIdNode,
  ProviderNode,
  StepDefinitionNode,
  VariableExpressionDefinitionNode,
} from '@superindustries/language';

export interface MapParameters {
  usecase?: string;
}

export interface MapVisitor {
  visit(
    node: MapASTNode,
    parameters: MapParameters
  ): Promise<unknown> | unknown;
  visitEvalDefinitionNode(
    node: EvalDefinitionNode,
    parameters: MapParameters
  ): Promise<unknown> | unknown;
  visitHTTPOperationDefinitionNode(
    node: HTTPOperationDefinitionNode,
    parameters: MapParameters
  ): Promise<unknown> | unknown;
  visitIterationDefinitionNode(
    node: IterationDefinitionNode,
    parameters: MapParameters
  ): Promise<unknown> | unknown;
  visitJSExpressionNode(
    node: JSExpressionNode,
    parameters: MapParameters
  ): Promise<unknown> | unknown;
  visitMapDefinitionNode(
    node: MapDefinitionNode,
    parameters: MapParameters
  ): Promise<unknown> | unknown;
  visitMapDocumentNode(
    node: MapDocumentNode,
    parameters: MapParameters
  ): Promise<unknown> | unknown;
  visitMapExpressionDefinitionNode(
    node: MapExpressionDefinitionNode,
    parameters: MapParameters
  ): Promise<unknown> | unknown;
  visitMapNode(
    node: MapNode,
    parameters: MapParameters
  ): Promise<unknown> | unknown;
  visitNetworkOperationDefinitionNode(
    node: NetworkOperationDefinitionNode,
    parameters: MapParameters
  ): Promise<unknown> | unknown;
  visitOperationCallDefinitionNode(
    node: OperationCallDefinitionNode,
    parameters: MapParameters
  ): Promise<unknown> | unknown;
  visitOperationDefinitionNode(
    node: OperationDefinitionNode,
    parameters: MapParameters
  ): Promise<unknown> | unknown;
  visitOutcomeDefinitionNode(
    node: OutcomeDefinitionNode,
    parameters: MapParameters
  ): Promise<unknown> | unknown;
  visitProfileIdNode(
    node: ProfileIdNode,
    parameters: MapParameters
  ): Promise<unknown> | unknown;
  visitProviderNode(
    node: ProviderNode,
    parameters: MapParameters
  ): Promise<unknown> | unknown;
  visitStepDefinitionNode(
    node: StepDefinitionNode,
    parameters: MapParameters
  ): Promise<unknown> | unknown;
  visitVariableExpressionDefinitionNode(
    node: VariableExpressionDefinitionNode,
    parameters: MapParameters
  ): Promise<unknown> | unknown;
}
