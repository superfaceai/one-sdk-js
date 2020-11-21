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
import { MapVisitor } from './interfaces';
import {
  castToVariables,
  isPrimitive,
  mergeVariables,
  NonPrimitive,
  Primitive,
  Variables,
} from './variables';

function assertUnreachable(node: never): never;
function assertUnreachable(node: MapASTNode): never {
  throw new Error(`Invalid Node kind: ${node.kind}`);
}

export interface MapParameters<TInput extends NonPrimitive> {
  usecase?: string;
  auth?: Config['auth'];
  baseUrl?: string;
  input?: TInput;
}

type HttpResponseHandler = (
  response: HttpResponse
) => Promise<[true, Variables | undefined] | [false]>;

type HttpResponseHandlerDefinition = [handler: HttpResponseHandler, accept?: string];

interface OutcomeDefinition {
  result?: Variables;
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

interface Stack {
  type: 'map' | 'operation';
  variables: NonPrimitive;
  result?: Variables;
}

export class MapInterpreter<TInput extends NonPrimitive> implements MapVisitor {
  private operations: Record<string, OperationDefinitionNode | undefined> = {};
  private stack: Stack[] = [];

  constructor(private readonly parameters: MapParameters<TInput>) {}

  visit(node: PrimitiveLiteralNode): Primitive;
  async visit(node: SetStatementNode): Promise<void>;
  async visit(
    node: OutcomeStatementNode
  ): Promise<OutcomeDefinition | undefined>;
  async visit(node: AssignmentNode): Promise<NonPrimitive>;
  async visit(node: LiteralNode): Promise<Variables>;
  async visit(node: StatementConditionNode): Promise<boolean>;
  async visit(node: HttpRequestNode): Promise<HttpRequest>;
  visit(node: HttpResponseHandlerNode): HttpResponseHandlerDefinition;
  visit(node: JessieExpressionNode): Variables | Primitive | undefined;
  async visit(node: MapASTNode): Promise<undefined | Variables | Primitive>;
  visit(
    node: MapASTNode
  ):
    | Promise<
        | undefined
        | Variables
        | Primitive
        | void
        | HttpRequest
        | OutcomeDefinition
      >
    | Primitive
    | Variables
    | HttpResponseHandlerDefinition
    | undefined {
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

  async visitAssignmentNode(node: AssignmentNode): Promise<NonPrimitive> {
    return this.constructObject(node.key, await this.visit(node.value));
  }

  async visitInlineCallNode(
    node: InlineCallNode
  ): Promise<Primitive | Variables | undefined> {
    const operation = this.operations[node.operationName];
    if (!operation) {
      throw new Error(`Operation not found: ${node.operationName}`);
    }

    return this.visit(operation);
  }

  async visitCallStatementNode(node: CallStatementNode): Promise<void> {
    const operation = this.operations[node.operationName];

    if (!operation) {
      throw new Error(`Calling undefined operation: ${node.operationName}`);
    }

    this.newStack('operation');
    const result = await this.visit(operation);
    this.addVariableToStack({ outcome: { data: result } });

    const secondResult = await this.processStatements(node.statements);
    this.popStack(secondResult);
  }

  async visitHttpCallStatementNode(node: HttpCallStatementNode): Promise<void> {
    const request = node.request && (await this.visit(node.request));
    const responseHandlers = node.responseHandlers.map(responseHandler =>
      this.visit(responseHandler)
    );

    let accept = '';
    if (responseHandlers.some(([, accept]) => accept === undefined)) {
      accept = '*/*';
    } else {
      const accepts = responseHandlers.map((([, accept]) => accept));
      accept = accepts.filter((accept, index) => accepts.indexOf(accept) === index).join(', ');
    }

    const response = await HttpClient.request(node.url, {
      method: node.method,
      headers: request?.headers,
      contentType: request?.contentType ?? 'application/json',
      accept,
      baseUrl: this.parameters.baseUrl,
      queryParameters: request?.queryParameters,
      pathParameters: this.variables,
      body: request?.body,
      security: request?.security,
      auth: this.parameters.auth,
    });

    for (const [handler] of responseHandlers) {
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
  ): HttpResponseHandlerDefinition {
    const handler: HttpResponseHandler = async (response: HttpResponse) => {
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

      this.addVariableToStack({ body: castToVariables(response.body) });

      const result = await this.processStatements(node.statements);

      return [true, result];
    };

    return [handler, node.contentType];
  }

  visitJessieExpressionNode(node: JessieExpressionNode): Variables | undefined {
    const result = evalScript(node.expression, this.variables);

    return castToVariables(result);
  }

  visitPrimitiveLiteralNode(node: PrimitiveLiteralNode): Primitive {
    return node.value;
  }

  private async processStatements(
    statements: Substatement[]
  ): Promise<Variables | undefined> {
    let result: Variables | undefined;
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
              this.stackTop.type === 'map'
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
  ): Promise<Variables | undefined> {
    this.newStack('map');
    let result = await this.processStatements(node.statements);

    result = {
      result:
        result ??
        ((!isPrimitive(this.stackTop.variables) &&
          this.stackTop.variables['result']) ||
        this.stackTop.result),
    };

    return result;
  }

  async visitMapDocumentNode(
    node: MapDocumentNode
  ): Promise<Variables | undefined> {
    for (const operation of node.definitions.filter(isOperationDefinitionNode)) {
      this.operations[operation.name] = operation;
    }
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
    let result: NonPrimitive = {};

    for (const field of node.fields) {
      result = mergeVariables(
        result,
        this.constructObject(field.key, await this.visit(field.value))
      );
    }

    return result;
  }

  async visitOperationDefinitionNode(
    node: OperationDefinitionNode
  ): Promise<Variables | undefined> {
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
    if (node.condition) {
      const condition = await this.visit(node.condition);

      if (condition === false) {
        return;
      }
    }

    let result: Variables = {};
    for (const assignment of node.assignments) {
      result = mergeVariables(result, await this.visit(assignment));
    }
    this.addVariableToStack(result);
  }

  async visitStatementConditionNode(
    node: StatementConditionNode
  ): Promise<boolean> {
    const result = await this.visit(node.expression);

    return result ? true : false;
  }

  private get variables(): NonPrimitive {
    let variables: NonPrimitive = {};

    for (const stacktop of this.stack) {
      variables = mergeVariables(variables, stacktop.variables);
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

  private addVariableToStack(variables: NonPrimitive): void {
    this.stackTop.variables = mergeVariables(
      this.stackTop.variables,
      variables
    );
  }

  private constructObject(keys: string[], value: Variables): NonPrimitive {
    const result: NonPrimitive = {};
    let current = result;

    for (const key of keys) {
      if (key === keys[keys.length - 1]) {
        current[key] = value;
      } else {
        current = current[key] = {};
      }
    }

    return result;
  }

  private newStack(type: Stack['type']): void {
    this.stack.push({ type, variables: {}, result: {} });
  }

  private popStack(result?: Variables): void {
    const last = this.stack.pop();
    if (this.stack.length > 0 && last) {
      this.stackTop.result = result ?? last.variables['result'];
    }
  }

  private get stackTop(): Stack {
    if (this.stack.length === 0) {
      throw new Error('Trying to get variables out of scope!');
    }

    return this.stack[this.stack.length - 1];
  }
}
