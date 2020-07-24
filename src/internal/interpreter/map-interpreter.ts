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
import { MapVisitor, Variables } from './interfaces';

function assertUnreachable(node: never): never;
function assertUnreachable(node: MapASTNode): never {
  throw new Error(`Invalid Node kind: ${node.kind}`);
}

export interface MapParameters {
  usecase?: string;
  auth?: {
    basic?: {
      username: string;
      password: string;
    };
    bearer?: {
      token: string;
    };
  };
  baseUrl?: string;
  input?: Variables;
}

export const mergeVariables = (
  left: Variables,
  right: Variables
): Variables => {
  const result: Variables = {};

  for (const key of Object.keys(left)) {
    result[key] = left[key];
  }
  for (const key of Object.keys(right)) {
    const l = left[key];
    const r = right[key];
    if (typeof r !== 'string' && typeof l === 'object') {
      result[key] = mergeVariables(l, r);
    } else {
      result[key] = right[key];
    }
  }

  return result;
};

export class MapInterpereter implements MapVisitor {
  private variableStack: Variables[] = [];

  private operations: OperationDefinitionNode[] = [];

  private operationScopedVariables: Record<string, Variables> = {};

  private operationScope: string | undefined;

  private mapScopedVariables: Record<string, Variables> = {};

  private mapScope: string | undefined;

  constructor(private readonly parameters: MapParameters) {}

  async visit(node: MapASTNode): Promise<unknown> {
    switch (node.kind) {
      case 'EvalDefinition':
        return this.visitEvalDefinitionNode(node);
      case 'HTTPOperationDefinition':
        return this.visitHTTPOperationDefinitionNode(node);
      case 'IterationDefinition':
        return this.visitIterationDefinitionNode(node);
      case 'JSExpression':
        return this.visitJSExpressionNode(node);
      case 'Map':
        return this.visitMapNode(node);
      case 'MapDefinition':
        return this.visitMapDefinitionNode(node);
      case 'MapDocument':
        return this.visitMapDocumentNode(node);
      case 'MapExpressionsDefinition':
        return this.visitMapExpressionDefinitionNode(node);
      case 'NetworkOperationDefinition':
        return this.visitNetworkOperationDefinitionNode(node);
      case 'OperationCallDefinition':
        return this.visitOperationCallDefinitionNode(node);
      case 'OperationDefinition':
        return this.visitOperationDefinitionNode(node);
      case 'OutcomeDefinition':
        return this.visitOutcomeDefinitionNode(node);
      case 'ProfileId':
        return this.visitProfileIdNode(node);
      case 'Provider':
        return this.visitProviderNode(node);
      case 'StepDefinition':
        return this.visitStepDefinitionNode(node);
      case 'VariableExpressionsDefinition':
        return this.visitVariableExpressionDefinitionNode(node);

      default:
        assertUnreachable(node);
    }
  }

  async visitEvalDefinitionNode(node: EvalDefinitionNode): Promise<unknown> {
    return this.visit(node.outcomeDefinition);
  }

  async visitHTTPOperationDefinitionNode(
    node: HTTPOperationDefinitionNode
  ): Promise<unknown> {
    const variables = await this.processVariableExpressions(
      node.variableExpressionsDefinition
    );
    this.variableStack.push(variables);

    const queryParameters = await this.processVariableExpressions(
      node.requestDefinition.queryParametersDefinition
    );

    const body = await this.processMapExpressions(node.requestDefinition.body);

    const headers = await this.processVariableExpressions(
      node.requestDefinition.headers
    );

    const response = await HttpClient.request(node.url, {
      queryParameters,
      method: node.method,
      body,
      headers,
      contentType: node.requestDefinition.contentType,
      accept: node.responseDefinition.contentType,
      security: node.requestDefinition.security,
      basic: this.parameters.auth?.basic,
      bearer: this.parameters.auth?.bearer,
      baseUrl: this.parameters.baseUrl,
      pathParameters: this.mapScope
        ? this.mapScopedVariables[this.mapScope]
        : undefined,
    });

    this.variableStack.push({
      body: response.body as string,
      headers: response.headers,
    });

    return await this.visit(node.responseDefinition.outcomeDefinition);
  }

  visitIterationDefinitionNode(
    _node: IterationDefinitionNode
  ): Promise<unknown> | unknown {
    throw new Error('Method not implemented.');
  }

  async visitJSExpressionNode(node: JSExpressionNode): Promise<unknown> {
    return await evalScript(node.expression, this.variables);
  }

  async visitMapDefinitionNode(node: MapDefinitionNode): Promise<unknown> {
    this.mapScope = node.mapName;

    let result: unknown;
    for (const step of node.stepsDefinition) {
      const condition = await this.visit(step.condition);

      if (condition) {
        const variables = await this.processVariableExpressions(
          node.variableExpressionsDefinition
        );

        this.variableStack.push(variables);
        const stepResult = await this.visit(step);
        this.variableStack.pop();

        if (stepResult) {
          result = stepResult;
        }
      }
    }

    this.mapScope = undefined;

    return result;
  }

  async visitMapDocumentNode(node: MapDocumentNode): Promise<unknown> {
    this.operations = node.definitions.filter(isOperationDefinitionNode);

    const operation = node.definitions
      .filter(isMapDefinitionNode)
      .find(definition => definition.usecaseName === this.parameters.usecase);

    if (!operation) {
      throw new Error('Usecase not found.');
    }

    return await this.visit(operation);
  }

  async visitMapExpressionDefinitionNode(
    node: MapExpressionDefinitionNode
  ): Promise<unknown> {
    const value = (await this.visit(node.right)) as string;
    const path = node.left.split('.');
    const result: Variables = {};
    let current: Variables = result;

    for (let i = 0; i < path.length; ++i) {
      if (i !== path.length - 1) {
        current = current[path[i]] = {};
      } else {
        current[path[i]] = value;
      }
    }

    return result;
  }

  visitMapNode(_node: MapNode): Promise<unknown> | unknown {
    throw new Error('Method not implemented.');
  }

  visitNetworkOperationDefinitionNode(
    node: NetworkOperationDefinitionNode
  ): Promise<unknown> | unknown {
    return this.visit(node.definition);
  }

  async visitOperationCallDefinitionNode(
    node: OperationCallDefinitionNode
  ): Promise<unknown> {
    const operation = this.operations.find(
      operation => operation.operationName === node.operationName
    );

    if (!operation) {
      throw new Error(`Operation ${node.operationName} not found!`);
    }

    let result = await this.visit(operation);

    this.operationScope = operation.operationName;

    if (!result) {
      result = await this.visit(node.successOutcomeDefinition);
    }

    this.operationScope = undefined;

    return result;
  }

  async visitOperationDefinitionNode(
    node: OperationDefinitionNode
  ): Promise<unknown> {
    this.operationScope = node.operationName;

    let result: unknown;
    for (const step of node.stepsDefinition) {
      const condition = await this.visit(step.condition);

      if (condition) {
        const variables = await this.processVariableExpressions(
          node.variableExpressionsDefinition
        );

        this.variableStack.push(variables);
        const stepResult = await this.visit(step);
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
    node: OutcomeDefinitionNode
  ): Promise<unknown> {
    if (node.returnDefinition) {
      return await this.processMapExpressions(node.returnDefinition);
    } else if (node.setDefinition) {
      if (this.operationScope) {
        this.operationScopedVariables[this.operationScope] = {
          ...(this.operationScopedVariables[this.operationScope] ?? {}),
          ...(await this.processVariableExpressions(node.setDefinition)),
        };

        return undefined;
      } else if (this.mapScope) {
        this.mapScopedVariables[this.mapScope] = {
          ...(this.mapScopedVariables[this.mapScope] ?? {}),
          ...(await this.processVariableExpressions(node.setDefinition)),
        };

        return undefined;
      }
    } else if (node.resultDefinition) {
      return await this.processMapExpressions(node.resultDefinition);
    }
    throw new Error('Something went very wrong, this should not happen!');
  }

  visitProfileIdNode(_node: MapProfileIdNode): Promise<unknown> | unknown {
    throw new Error('Method not implemented.');
  }

  visitProviderNode(_node: ProviderNode): Promise<unknown> | unknown {
    throw new Error('Method not implemented.');
  }

  async visitStepDefinitionNode(node: StepDefinitionNode): Promise<unknown> {
    const variables = await this.processVariableExpressions(
      node.variableExpressionsDefinition
    );

    this.variableStack.push(variables);
    const result = await this.visit(node.run);
    this.variableStack.pop();

    return result;
  }

  async visitVariableExpressionDefinitionNode(
    node: VariableExpressionDefinitionNode
  ): Promise<unknown> {
    return {
      [node.left]: (await this.visit(node.right)) as string,
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

    variables = {
      ...variables,
      input: this.parameters.input ?? {},
    };

    return variables;
  }

  private async processVariableExpressions(
    expressions: VariableExpressionDefinitionNode[]
  ): Promise<Record<string, string>> {
    let variables: Record<string, string> = {};
    for (const expression of expressions) {
      const result = (await this.visit(expression)) as Record<string, string>;
      variables = { ...variables, ...result };
    }

    return variables;
  }

  private async processMapExpressions(
    expressions: MapExpressionDefinitionNode[]
  ): Promise<Variables> {
    let variables: Variables = {};
    for (const expression of expressions) {
      const result = (await this.visit(expression)) as Variables;
      variables = mergeVariables(variables, result);
    }

    return variables;
  }
}
