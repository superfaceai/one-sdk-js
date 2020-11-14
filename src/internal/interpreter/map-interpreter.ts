import {
  AssignmentNode,
  CallStatementNode,
  HttpCallStatementNode,
  HttpRequestNode,
  HttpResponseHandlerNode,
  HttpSecurity,
  InlineCallNode,
  isMapDefinitionNode,
  isOperationDefinitionNode,
  JessieExpressionNode,
  LiteralNode,
  MapASTNode,
  MapDefinitionNode,
  MapDocumentNode,
  MapNode,
  MapProfileIdNode,
  ObjectLiteralNode,
  OperationDefinitionNode,
  OutcomeStatementNode,
  PrimitiveLiteralNode,
  ProviderNode,
  SetStatementNode,
  StatementConditionNode,
  Substatement,
} from '@superfaceai/language';

import { Config } from '../../client';
import { evalScript } from '../../client/interpreter/Sandbox';
import { HttpClient, HttpResponse } from '../http';
import { MapVisitor, Variables } from './interfaces';

function assertUnreachable(node: never): never;
function assertUnreachable(node: MapASTNode): never {
  throw new Error(`Invalid Node kind: ${node.kind}`);
}

export interface MapParameters<T> {
  usecase?: string;
  auth?: Config['auth'];
  baseUrl?: string;
  input?: Variables | T;
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
    if (
      r &&
      typeof r !== 'string' &&
      typeof r !== 'boolean' &&
      typeof l === 'object'
    ) {
      result[key] = mergeVariables(l, r);
    } else {
      result[key] = right[key];
    }
  }

  return result;
};

type HttpResponseHandler = (
  response: HttpResponse
) => Promise<[true, Variables | boolean | string | undefined] | [false]>;

interface OutcomeDefinition {
  result?: Variables | string | boolean;
  error: boolean;
  terminateFlow: boolean;
}

interface HttpRequest {
  contentType?: string;
  contentLanguage?: string;
  headers?: Variables;
  queryParameters?: Variables;
  body?: Variables;
  security?: HttpSecurity;
}

export class MapInterpreter<T> implements MapVisitor {
  private operations: OperationDefinitionNode[] = [];
  private operationScopedVariables: Record<string, Variables> = {};
  private operationScope: string | undefined;
  private stack: [type: 'map' | 'operation', variables: Variables, result: Variables | undefined | string | boolean][] = [];

  constructor(private readonly parameters: MapParameters<T>) {}

  visit(node: PrimitiveLiteralNode): string | number | boolean;
  async visit(node: SetStatementNode): Promise<void>;
  async visit(
    node: OutcomeStatementNode
  ): Promise<OutcomeDefinition | undefined>;
  async visit(node: AssignmentNode | LiteralNode): Promise<Variables>;
  async visit(node: StatementConditionNode): Promise<boolean>;
  async visit(node: HttpRequestNode): Promise<HttpRequest>;
  visit(node: HttpResponseHandlerNode): HttpResponseHandler;
  visit(node: JessieExpressionNode): unknown;
  async visit(
    node: MapASTNode
  ): Promise<undefined | Variables | string | boolean>;
  visit(
    node: MapASTNode
  ):
    | Promise<
        | undefined
        | Variables
        | string
        | boolean
        | void
        | HttpRequest
        | OutcomeDefinition
      >
    | string
    | number
    | boolean
    | Variables
    | HttpResponseHandler
    | unknown
  {
    switch (node.kind) {
      case 'Assignment':
        return this.visitAssignmentNode(node);
      case 'CallStatement':
        return this.visitCallStatementNode(node);
      case 'HttpCallStatement':
        return this.visitHttpCallStatementNode(node);
      case 'HttpRequest':
        return this.visitHttpRequestNode(node);
      case 'HttpResponseHandler':
        return this.visitHttpResponseHandlerNode(node);
      case 'InlineCall':
        return this.visitInlineCallNode(node);
      case 'JessieExpression':
        return this.visitJessieExpressionNode(node);
      case 'Map':
        return this.visitMapNode(node);
      case 'MapDefinition':
        return this.visitMapDefinitionNode(node);
      case 'MapDocument':
        return this.visitMapDocumentNode(node);
      case 'ProfileId':
        return this.visitMapProfileIdNode(node);
      case 'ObjectLiteral':
        return this.visitObjectLiteralNode(node);
      case 'OperationDefinition':
        return this.visitOperationDefinitionNode(node);
      case 'OutcomeStatement':
        return this.visitOutcomeStatementNode(node);
      case 'PrimitiveLiteral':
        return this.visitPrimitiveLiteralNode(node);
      case 'Provider':
        return this.visitProviderNode(node);
      case 'SetStatement':
        return this.visitSetStatementNode(node);
      case 'StatementCondition':
        return this.visitStatementConditionNode(node);

      default:
        assertUnreachable(node);
    }
  }

  async visitAssignmentNode(node: AssignmentNode): Promise<Variables> {
    return this.constructObject(node.key, await this.visit(node.value));
  }

  async visitInlineCallNode(
    node: InlineCallNode
  ): Promise<string | boolean | Variables | undefined> {
    const operation = this.operations.find(
      op => op.name === node.operationName
    );
    if (!operation) {
      throw new Error(`Operation not found: ${node.operationName}`);
    }

    return this.visit(operation);
  }

  async visitCallStatementNode(node: CallStatementNode): Promise<void> {
    const operation = this.operations.find(
      op => op.name === node.operationName
    );

    if (!operation) {
      throw new Error(`Calling undefined operation: ${node.operationName}`);
    }

    this.stack.push(['operation', {}, {}]);
    const result = await this.visit(operation);
    this.addVariableToStack({ outcome: { data: result } });

    const secondResult = await this.processStatements(node.statements);

    const last = this.stack.pop();
    if (this.stack.length && last) {
      this.stack[this.stack.length - 1][2] = secondResult ?? last[1]['result'];
    }
  }

  async visitHttpCallStatementNode(node: HttpCallStatementNode): Promise<void> {
    const request = node.request && (await this.visit(node.request));

    const response = await HttpClient.request(node.url, {
      method: node.method,
      headers: request?.headers,
      contentType: request?.contentType ?? 'application/json',
      accept: 'application/json',
      baseUrl: this.parameters.baseUrl,
      queryParameters: request?.queryParameters,
      pathParameters: this.variables,
      body: request?.body,
      security: request?.security,
      auth: this.parameters.auth,
    });

    for (const responseHandler of node.responseHandlers) {
      const handler = this.visit(responseHandler);
      const [match, result] = await handler(response);

      if (match && result) {
        this.addVariableToStack({ result });

        return;
      }
    }
  }

  async visitHttpRequestNode(node: HttpRequestNode): Promise<HttpRequest> {
    return {
      contentType: node.contentType,
      contentLanguage: node.contentLanguage,
      headers: node.headers && (await this.visit(node.headers)),
      queryParameters: node.query && (await this.visit(node.query)),
      body: node.body && (await this.visit(node.body)),
      security: node.security,
    };
  }

  visitHttpResponseHandlerNode(
    node: HttpResponseHandlerNode
  ): HttpResponseHandler {
    return async (response: HttpResponse) => {
      if (node.statusCode && node.statusCode !== response.statusCode) {
        return [false];
      }

      if (
        node.contentType &&
        response.headers['content-type'] &&
        !response.headers['content-type'].includes(node.contentType)
      ) {
        return [false];
      }

      if (
        node.contentLanguage &&
        response.headers['content-language'] &&
        !response.headers['content-language'].includes(node.contentLanguage)
      ) {
        return [false];
      }

      this.addVariableToStack({ body: response.body as Variables });

      const result = await this.processStatements(node.statements);

      return [true, result];
    };
  }

  visitJessieExpressionNode(node: JessieExpressionNode): unknown {
    return evalScript(node.expression, this.variables);
  }

  visitPrimitiveLiteralNode(
    node: PrimitiveLiteralNode
  ): string | number | boolean {
    return node.value;
  }

  private async processStatements(
    statements: Substatement[]
  ): Promise<Variables | string | boolean | undefined> {
    let result: Variables | boolean | string | undefined;
    for (const statement of statements) {
      switch (statement.kind) {
        case 'SetStatement':
        case 'HttpCallStatement':
        case 'CallStatement':
          result = await this.visit(statement);
          break;

        case 'OutcomeStatement': {
          const outcome = await this.visit(statement);
          result = outcome?.result ?? result;
          if (outcome?.terminateFlow) {
            return result;
          } else {
            this.addVariableToStack(
              this.stack[this.stack.length - 1][0] === 'map'
                ? { result }
                : { outcome: { data: result } }
            );
          }
          break;
        }
      }
    }

    return result;
  }

  async visitMapDefinitionNode(
    node: MapDefinitionNode
  ): Promise<Variables | string | boolean | undefined> {
    this.stack.push(['map', {}, {}]);
    let result = await this.processStatements(node.statements);

    result = {
      result: result ?? this.stack[this.stack.length - 1][1]['result'] ?? this.stack[this.stack.length - 1][2],
    };

    return result;
  }

  async visitMapDocumentNode(
    node: MapDocumentNode
  ): Promise<string | Variables | undefined | boolean> {
    this.operations = node.definitions.filter(isOperationDefinitionNode);
    const operation = node.definitions
      .filter(isMapDefinitionNode)
      .find(definition => definition.usecaseName === this.parameters.usecase);

    if (!operation) {
      throw new Error('Usecase not found.');
    }

    return await this.visit(operation);
  }

  visitMapProfileIdNode(_node: MapProfileIdNode): never {
    throw new Error('Method not implemented.');
  }

  visitMapNode(_node: MapNode): never {
    throw new Error('Method not implemented.');
  }

  async visitObjectLiteralNode(node: ObjectLiteralNode): Promise<Variables> {
    let result: Variables = {};

    for (const field of node.fields) {
      result = mergeVariables(result, this.constructObject(field.key, await this.visit(field.value)));
    }

    return result;
  }

  async visitOperationDefinitionNode(
    node: OperationDefinitionNode
  ): Promise<string | boolean | Variables | undefined> {
    const result = await this.processStatements(node.statements);

    return result;
  }

  async visitOutcomeStatementNode(
    node: OutcomeStatementNode
  ): Promise<OutcomeDefinition | undefined> {
    if (node.condition) {
      const condition = await this.visit(node.condition);

      if (condition === false) {
        return undefined;
      }
    }

    return {
      result: await this.visit(node.value),
      error: node.isError,
      terminateFlow: node.terminateFlow,
    };
  }

  visitProfileIdNode(_node: MapProfileIdNode): never {
    throw new Error('Method not implemented.');
  }

  visitProviderNode(_node: ProviderNode): never {
    throw new Error('Method not implemented.');
  }

  async visitSetStatementNode(node: SetStatementNode): Promise<void> {
    const condition = node.condition ? await this.visit(node.condition) : true;

    if (condition === false) {
      return;
    }

    let result: Variables = {};
    for (const assignment of node.assignments) {
      result = mergeVariables(result, await this.visit(assignment));
    }
    this.addVariableToStack(result);
  }

  async visitStatementConditionNode(node: StatementConditionNode): Promise<boolean> {
    const result = await this.visit(node.expression);

    return result ? true : false;
  }

  private get variables(): Variables {
    let variables: Variables = {};

    if (
      this.operationScope &&
      this.operationScopedVariables[this.operationScope]
    ) {
      variables = {
        ...variables,
        ...this.operationScopedVariables[this.operationScope],
      };
    }

    for (const stacktop of this.stack) {
      variables = mergeVariables(variables, stacktop[1]);
    }

    variables = {
      ...variables,
      input: {
        ...(this.parameters.input ?? {}),
        auth: this.parameters.auth ?? {},
      },
    };

    return variables;
  }

  private addVariableToStack(variables: Variables): void {
    if (!this.stack.length) {
      throw new Error('Trying to set variables out of scope!');
    }
    this.stack[this.stack.length - 1][1] = mergeVariables(
      this.stack[this.stack.length - 1][1],
      variables
    );
  }

  private constructObject(keys: string[], value: Variables): Variables {
    const result: Variables = {};
    let current = result;

    for (const key of keys) {
      current = current[key] = key === keys[keys.length - 1] ? value : {};
    }

    return result;
  }

}
