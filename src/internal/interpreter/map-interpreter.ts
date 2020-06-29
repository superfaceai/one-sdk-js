import {
  EvalDefinitionNode,
  HTTPOperationDefinitionNode,
  isMapDefinitionNode,
  isOperationDefinitionNode,
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

import { Sandbox } from '../../client/interpreter/Sandbox';
import { HttpClient } from '../http';
import { MapParameters, MapVisitor } from './interfaces';

function assertUnreachable(_node: never): never;
function assertUnreachable(node: MapASTNode): never {
  throw new Error(`Invalid Node kind: ${node.kind}`);
}

export class MapInterpereter implements MapVisitor {
  private variableStack: Record<string, string>[] = [];

  private operations: OperationDefinitionNode[] = [];

  private scopedVariables: Record<string, Record<string, string>> = {};

  private operationScope: string | undefined;

  async visit(node: MapASTNode, parameters: MapParameters): Promise<unknown> {
    switch (node.kind) {
      case 'EvalDefinition':
        return await this.visitEvalDefinitionNode(node, parameters);
      case 'HTTPOperationDefinition':
        return this.visitHTTPOperationDefinitionNode(node, parameters);
      case 'IterationDefinition':
        return this.visitIterationDefinitionNode(node, parameters);
      case 'JSExpression':
        return this.visitJSExpressionNode(node, parameters);
      case 'Map':
        return this.visitMapNode(node, parameters);
      case 'MapDefinition':
        return this.visitMapDefinitionNode(node, parameters);
      case 'MapDocument':
        return this.visitMapDocumentNode(node, parameters);
      case 'MapExpressionsDefinition':
        return this.visitMapExpressionDefinitionNode(node, parameters);
      case 'NetworkOperationDefinition':
        return this.visitNetworkOperationDefinitionNode(node, parameters);
      case 'OperationCallDefinition':
        return this.visitOperationCallDefinitionNode(node, parameters);
      case 'OperationDefinition':
        return this.visitOperationDefinitionNode(node, parameters);
      case 'OutcomeDefinition':
        return this.visitOutcomeDefinitionNode(node, parameters);
      case 'ProfileId':
        return this.visitProfileIdNode(node, parameters);
      case 'Provider':
        return this.visitProviderNode(node, parameters);
      case 'StepDefinition':
        return this.visitStepDefinitionNode(node, parameters);
      case 'VariableExpressionsDefinition':
        return this.visitVariableExpressionDefinitionNode(node, parameters);

      default:
        assertUnreachable(node);
    }
  }

  async visitEvalDefinitionNode(
    node: EvalDefinitionNode,
    parameters: MapParameters
  ): Promise<unknown> {
    return this.visit(node.outcomeDefinition, parameters);
  }

  async visitHTTPOperationDefinitionNode(
    node: HTTPOperationDefinitionNode,
    parameters: MapParameters
  ): Promise<unknown> {
    const variables = await this.processVariableExpressions(
      node.variableExpressionsDefinition,
      parameters
    );
    this.variableStack.push(variables);

    const queryParameters = await this.processVariableExpressions(
      node.requestDefinition.queryParametersDefinition,
      parameters
    );

    const body = await this.processMapExpressions(
      node.requestDefinition.body,
      parameters
    );

    const headers = await this.processVariableExpressions(
      node.requestDefinition.headers,
      parameters
    );

    const response = await HttpClient.request(node.url, {
      queryParameters,
      method: node.method,
      body,
      headers,
    });

    this.variableStack.push({ response: response.body as string });

    return await this.visit(
      node.responseDefinition.outcomeDefinition,
      parameters
    );
  }

  visitIterationDefinitionNode(
    _node: IterationDefinitionNode,
    _parameters: MapParameters
  ): Promise<unknown> | unknown {
    throw new Error('Method not implemented.');
  }

  async visitJSExpressionNode(
    node: JSExpressionNode,
    _parameters: MapParameters
  ): Promise<unknown> {
    const sandbox = new Sandbox();

    return await sandbox.evalJS(node.expression, this.variables);
  }

  async visitMapDefinitionNode(
    node: MapDefinitionNode,
    parameters: MapParameters
  ): Promise<unknown> {
    const viableSteps = node.stepsDefinition.filter(async stepDefinition => {
      return await this.visit(stepDefinition.condition, parameters);
    });

    if (viableSteps.length < 1) {
      throw new Error('No step satisfies condition!');
    }

    const variables = await this.processVariableExpressions(
      node.variableExpressionsDefinition,
      parameters
    );

    this.variableStack.push(variables);
    const result = await this.visit(viableSteps[0], parameters);
    this.variableStack.pop();

    return result;
  }

  async visitMapDocumentNode(
    node: MapDocumentNode,
    parameters: MapParameters
  ): Promise<unknown> {
    this.operations = node.definitions.filter(isOperationDefinitionNode);

    const operation = node.definitions
      .filter(isMapDefinitionNode)
      .find(definition => definition.usecaseName === parameters.usecase);

    if (!operation) {
      throw new Error('Operation not found');
    }

    return await this.visit(operation, parameters);
  }

  async visitMapExpressionDefinitionNode(
    node: MapExpressionDefinitionNode,
    parameters: MapParameters
  ): Promise<unknown> {
    return {
      [node.left]: (await this.visit(node.right, parameters)) as string,
    };
  }

  visitMapNode(
    _node: MapNode,
    _parameters: MapParameters
  ): Promise<unknown> | unknown {
    throw new Error('Method not implemented.');
  }

  visitNetworkOperationDefinitionNode(
    node: NetworkOperationDefinitionNode,
    parameters: MapParameters
  ): Promise<unknown> | unknown {
    return this.visit(node.definition, parameters);
  }

  async visitOperationCallDefinitionNode(
    node: OperationCallDefinitionNode,
    parameters: MapParameters
  ): Promise<unknown> {
    const operation = this.operations.find(
      operation => operation.operationName === node.operationName
    );

    if (!operation) {
      throw new Error(`Operation ${node.operationName} not found!`);
    }

    this.operationScope = operation.operationName;
    let result = await this.visit(operation, parameters);

    if (!result) {
      result = await this.visit(node.successOutcomeDefinition, parameters);
    }

    this.operationScope = undefined;

    return result;
  }

  async visitOperationDefinitionNode(
    node: OperationDefinitionNode,
    parameters: MapParameters
  ): Promise<unknown> {
    const viableSteps = node.stepsDefinition.filter(async stepDefinition => {
      return await this.visit(stepDefinition.condition, parameters);
    });

    if (viableSteps.length < 1) {
      throw new Error('No step satisfies condition!');
    }

    const result = await this.visit(viableSteps[0], parameters);

    return result;
  }

  async visitOutcomeDefinitionNode(
    node: OutcomeDefinitionNode,
    parameters: MapParameters
  ): Promise<unknown> {
    if (node.returnDefinition) {
      return await this.processMapExpressions(
        node.returnDefinition,
        parameters
      );
    } else if (node.setDefinition) {
      if (!this.operationScope) {
        throw new Error(
          'Something very wrong happened. How did you even get here?'
        );
      }
      this.scopedVariables[
        this.operationScope
      ] = await this.processVariableExpressions(node.setDefinition, parameters);

      return undefined;
    } else if (node.resultDefinition) {
      return await this.processMapExpressions(
        node.resultDefinition,
        parameters
      );
    } else {
      throw new Error('Something went very wrong, this should not happen!');
    }
  }

  visitProfileIdNode(
    _node: ProfileIdNode,
    _parameters: MapParameters
  ): Promise<unknown> | unknown {
    throw new Error('Method not implemented.');
  }

  visitProviderNode(
    _node: ProviderNode,
    _parameters: MapParameters
  ): Promise<unknown> | unknown {
    throw new Error('Method not implemented.');
  }

  async visitStepDefinitionNode(
    node: StepDefinitionNode,
    parameters: MapParameters
  ): Promise<unknown> {
    const variables = await this.processVariableExpressions(
      node.variableExpressionsDefinition,
      parameters
    );

    this.variableStack.push(variables);
    const result = await this.visit(node.run, parameters);
    this.variableStack.pop();

    return result;
  }

  async visitVariableExpressionDefinitionNode(
    node: VariableExpressionDefinitionNode,
    parameters: MapParameters
  ): Promise<unknown> {
    return {
      [node.left]: (await this.visit(node.right, parameters)) as string,
    };
  }

  private get variables(): Record<string, string> {
    let variables = this.variableStack.reduce(
      (acc, variableDefinition) => ({
        ...acc,
        ...variableDefinition,
      }),
      {}
    );

    if (this.operationScope && this.scopedVariables[this.operationScope]) {
      variables = {
        ...variables,
        ...this.scopedVariables[this.operationScope],
      };
    }

    return variables;
  }

  private async processVariableExpressions(
    expressions: VariableExpressionDefinitionNode[],
    parameters: MapParameters
  ): Promise<Record<string, string>> {
    return expressions.reduce(
      async (acc, expression) => ({
        ...acc,
        ...((await this.visit(expression, parameters)) as {}),
      }),
      Promise.resolve({})
    );
  }

  private async processMapExpressions(
    expressions: MapExpressionDefinitionNode[],
    parameters: MapParameters
  ): Promise<Record<string, string>> {
    return expressions.reduce(
      async (acc, expression) => ({
        ...acc,
        ...((await this.visit(expression, parameters)) as {}),
      }),
      Promise.resolve({})
    );
  }
}
