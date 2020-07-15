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
  MapProfileIdNode,
  NetworkOperationDefinitionNode,
  OperationCallDefinitionNode,
  OperationDefinitionNode,
  OutcomeDefinitionNode,
  ProviderNode,
  StepDefinitionNode,
  VariableExpressionDefinitionNode,
} from '@superindustries/language';

import { evalScript } from '../../client/interpreter/Sandbox';
import { HttpClient } from '../http';
import { MapParameters, MapVisitor } from './interfaces';

function assertUnreachable(node: never): never;
function assertUnreachable(node: MapASTNode): never {
  throw new Error(`Invalid Node kind: ${node.kind}`);
}

export type Variables = {
  [key: string]: string | Variables;
};

export class MapInterpereter implements MapVisitor {
  private variableStack: Variables[] = [];

  private operations: OperationDefinitionNode[] = [];

  private operationScopedVariables: Record<string, Variables> = {};

  private operationScope: string | undefined;

  private mapScopedVariables: Record<string, Variables> = {};

  private mapScope: string | undefined;

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
      contentType: node.requestDefinition.contentType,
      accept: node.responseDefinition.contentType,
      security: node.requestDefinition.security,
      basic: parameters.auth?.basic,
      bearer: parameters.auth?.bearer,
      baseUrl: parameters.baseUrl,
    });

    this.variableStack.push({
      body: response.body as string,
      headers: response.headers,
    });

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
    return await evalScript(node.expression, this.variables);
  }

  async visitMapDefinitionNode(
    node: MapDefinitionNode,
    parameters: MapParameters
  ): Promise<unknown> {
    this.mapScope = node.mapName;

    let result: unknown;
    for (const step of node.stepsDefinition) {
      const condition = await this.visit(step.condition, parameters);

      if (condition) {
        const variables = await this.processVariableExpressions(
          node.variableExpressionsDefinition,
          parameters
        );

        this.variableStack.push(variables);
        const stepResult = await this.visit(step, parameters);
        this.variableStack.pop();

        if (stepResult) {
          result = stepResult;
        }
      }
    }

    this.mapScope = undefined;

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
      throw new Error('Usecase not found.');
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

    let result = await this.visit(operation, parameters);

    this.operationScope = operation.operationName;

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
    this.operationScope = node.operationName;

    let result: unknown;
    for (const step of node.stepsDefinition) {
      const condition = await this.visit(step.condition, parameters);

      if (condition) {
        const variables = await this.processVariableExpressions(
          node.variableExpressionsDefinition,
          parameters
        );

        this.variableStack.push(variables);
        const stepResult = await this.visit(step, parameters);
        this.variableStack.pop();

        if (stepResult) {
          result = stepResult;
        }
      }
    }

    this.operationScope = undefined;

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
      if (this.operationScope) {
        this.operationScopedVariables[this.operationScope] = {
          ...(this.operationScopedVariables[this.operationScope] || {}),
          ...(await this.processVariableExpressions(
            node.setDefinition,
            parameters
          )),
        };

        return undefined;
      } else if (this.mapScope) {
        this.mapScopedVariables[this.mapScope] = {
          ...(this.mapScopedVariables[this.mapScope] || {}),
          ...(await this.processVariableExpressions(
            node.setDefinition,
            parameters
          )),
        };

        return undefined;
      }
    } else if (node.resultDefinition) {
      return await this.processMapExpressions(
        node.resultDefinition,
        parameters
      );
    }
    throw new Error('Something went very wrong, this should not happen!');
  }

  visitProfileIdNode(
    _node: MapProfileIdNode,
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

  private get variables(): Variables {
    let variables = this.variableStack.reduce(
      (acc, variableDefinition) => ({
        ...acc,
        ...variableDefinition,
      }),
      {}
    );

    if (this.mapScope && this.mapScopedVariables[this.mapScope]) {
      variables = {
        ...variables,
        ...this.mapScopedVariables[this.mapScope],
      };
    }

    if (
      this.operationScope &&
      this.operationScopedVariables[this.operationScope]
    ) {
      variables = {
        ...variables,
        ...this.operationScopedVariables[this.operationScope],
      };
    }

    return variables;
  }

  private async processVariableExpressions(
    expressions: VariableExpressionDefinitionNode[],
    parameters: MapParameters
  ): Promise<Record<string, string>> {
    let variables: Record<string, string> = {};
    for (const expression of expressions) {
      const result = (await this.visit(expression, parameters)) as Record<
        string,
        string
      >;
      variables = { ...variables, ...result };
    }

    return variables;
  }

  private async processMapExpressions(
    expressions: MapExpressionDefinitionNode[],
    parameters: MapParameters
  ): Promise<Record<string, string>> {
    let variables: Record<string, string> = {};
    for (const expression of expressions) {
      const result = (await this.visit(expression, parameters)) as Record<
        string,
        string
      >;
      variables = { ...variables, ...result };
    }

    return variables;
  }
}
