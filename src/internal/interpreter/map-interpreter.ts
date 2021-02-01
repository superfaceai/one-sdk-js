import {
  AssignmentNode,
  CallStatementNode,
  ConditionAtomNode,
  HttpCallStatementNode,
  HttpRequestNode,
  HttpResponseHandlerNode,
  HttpSecurity,
  InlineCallNode,
  isMapDefinitionNode,
  isOperationDefinitionNode,
  IterationAtomNode,
  JessieExpressionNode,
  LiteralNode,
  MapASTNode,
  MapAstVisitor,
  MapDefinitionNode,
  MapDocumentNode,
  MapHeaderNode,
  ObjectLiteralNode,
  OperationDefinitionNode,
  OutcomeStatementNode,
  PrimitiveLiteralNode,
  SetStatementNode,
  Substatement,
} from '@superfaceai/ast';
import createDebug from 'debug';

import { err, ok, Result } from '../../lib';
import { UnexpectedError } from '../errors';
import { HttpClient, HttpResponse } from '../http';
import { Auth, SuperJSONDocument } from '../superjson';
import {
  HTTPError,
  JessieError,
  MapASTError,
  MapInterpreterError,
  MappedHTTPError,
} from './map-interpreter.errors';
import { evalScript } from './sandbox';
import {
  castToVariables,
  isPrimitive,
  mergeVariables,
  NonPrimitive,
  Primitive,
  Variables,
} from './variables';

const debug = createDebug('superface:map-interpreter');

function assertUnreachable(node: never): never;
function assertUnreachable(node: MapASTNode): never {
  throw new UnexpectedError(`Invalid Node kind: ${node.kind}`);
}

function isIterable(input: unknown): input is Iterable<Variables> {
  return (
    typeof input === 'object' && input !== null && Symbol.iterator in input
  );
}

function hasIteration<T extends CallStatementNode | InlineCallNode>(
  node: T
): node is T & { iteration: IterationAtomNode } {
  return node.iteration !== undefined;
}

export type ProviderConfig = {
  auth?: Auth;
};

export interface MapParameters<
  TInput extends NonPrimitive | undefined = undefined
> {
  usecase?: string;
  input?: TInput;
  superJson?: SuperJSONDocument;
  provider: string;
  deployment: string;
  config?: ProviderConfig;
}

type HttpResponseHandler = (
  response: HttpResponse
) => Promise<[true, Variables | undefined] | [false]>;

type HttpResponseHandlerDefinition = [
  handler: HttpResponseHandler,
  accept?: string
];

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
  terminate: boolean;
  result?: Variables;
  error?: MapInterpreterError;
}

type IterationDefinition = {
  iterationVariable: string;
  iterable: Iterable<Variables>;
};

export class MapInterpreter<TInput extends NonPrimitive | undefined>
  implements MapAstVisitor {
  private operations: Record<string, OperationDefinitionNode | undefined> = {};
  private stack: Stack[] = [];
  private ast?: MapDocumentNode;

  constructor(private readonly parameters: MapParameters<TInput>) {}

  async perform(
    ast: MapDocumentNode
  ): Promise<Result<Variables | undefined, MapInterpreterError>> {
    this.ast = ast;
    try {
      const result = await this.visit(ast);

      if (result.error) {
        return err(result.error);
      }

      return ok(result.result);
    } catch (e) {
      return err(e);
    }
  }

  visit(node: PrimitiveLiteralNode): Primitive;
  async visit(node: SetStatementNode): Promise<void>;
  async visit(
    node: OutcomeStatementNode
  ): Promise<OutcomeDefinition | undefined>;
  async visit(node: AssignmentNode): Promise<NonPrimitive>;
  async visit(node: LiteralNode): Promise<Variables>;
  async visit(node: ConditionAtomNode): Promise<boolean>;
  async visit(node: HttpRequestNode): Promise<HttpRequest>;
  async visit(node: InlineCallNode): Promise<Variables | undefined>;
  async visit(node: IterationAtomNode): Promise<IterationDefinition>;
  visit(node: HttpResponseHandlerNode): HttpResponseHandlerDefinition;
  visit(node: JessieExpressionNode): Variables | Primitive | undefined;
  async visit(
    node: MapDocumentNode
  ): Promise<{ result?: Variables; error?: MapInterpreterError }>;
  async visit(node: MapASTNode): Promise<Variables | undefined>;
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
        | { result?: Variables; error?: MapInterpreterError }
        | IterationDefinition
      >
    | Primitive
    | Variables
    | HttpResponseHandlerDefinition
    | undefined {
    debug(
      'Visiting node:',
      node.kind,
      node.location
        ? `Line: ${node.location.line}, Column: ${node.location.line}`
        : ''
    );
    switch (node.kind) {
      case 'Assignment':
        return this.visitAssignmentNode(node);
      case 'CallStatement':
        return this.visitCallStatementNode(node);
      case 'ConditionAtom':
        return this.visitConditionAtomNode(node);
      case 'HttpCallStatement':
        return this.visitHttpCallStatementNode(node);
      case 'HttpRequest':
        return this.visitHttpRequestNode(node);
      case 'HttpResponseHandler':
        return this.visitHttpResponseHandlerNode(node);
      case 'InlineCall':
        return this.visitInlineCallNode(node);
      case 'IterationAtom':
        return this.visitIterationAtomNode(node);
      case 'JessieExpression':
        return this.visitJessieExpressionNode(node);
      case 'MapDefinition':
        return this.visitMapDefinitionNode(node);
      case 'MapHeader':
        return this.visitMapHeaderNode(node);
      case 'MapDocument':
        return this.visitMapDocumentNode(node);
      case 'ObjectLiteral':
        return this.visitObjectLiteralNode(node);
      case 'OperationDefinition':
        return this.visitOperationDefinitionNode(node);
      case 'OutcomeStatement':
        return this.visitOutcomeStatementNode(node);
      case 'PrimitiveLiteral':
        return this.visitPrimitiveLiteralNode(node);
      case 'SetStatement':
        return this.visitSetStatementNode(node);

      default:
        assertUnreachable(node);
    }
  }

  async visitAssignmentNode(node: AssignmentNode): Promise<NonPrimitive> {
    const result = await this.visit(node.value);

    return this.constructObject(node.key, result);
  }

  async visitConditionAtomNode(node: ConditionAtomNode): Promise<boolean> {
    const result = await this.visit(node.expression);

    return result ? true : false;
  }

  async visitCallStatementNode(node: CallStatementNode): Promise<void> {
    if (hasIteration(node)) {
      const processResults = async (result?: Variables) => {
        this.addVariableToStack({ outcome: { data: result } });
        await this.processStatements(node.statements);
      };
      await this.iterate(node, processResults);
    } else {
      if (node.condition) {
        const condition = await this.visit(node.condition);
        if (condition === false) {
          return;
        }
      }
      const result = await this.visitCallCommon(node);

      this.addVariableToStack({ outcome: { data: result } });
      this.stackTop.result = await this.processStatements(node.statements);
    }
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
      const accepts = responseHandlers.map(([, accept]) => accept);
      accept = accepts
        .filter((accept, index) => accepts.indexOf(accept) === index)
        .join(', ');
    }

    debug('Performing http request:', node.url);

    const response = await HttpClient.request(node.url, {
      method: node.method,
      headers: request?.headers,
      contentType: request?.contentType ?? 'application/json',
      accept,
      baseUrl: this.baseUrl,
      queryParameters: request?.queryParameters,
      pathParameters: this.variables,
      body: request?.body,
      security: request?.security,
      auth:
        this.parameters.config?.auth ??
        this.parameters.superJson?.providers?.[this.parameters.provider].auth,
    });

    for (const [handler] of responseHandlers) {
      const [match, result] = await handler(response);

      if (match) {
        if (result) {
          this.stackTop.result = result;
        }

        return;
      }
    }
    if (response.statusCode >= 400) {
      throw new HTTPError(
        'HTTP Error',
        { node, ast: this.ast },
        response.statusCode,
        response.debug.request,
        { body: response.body, headers: response.headers }
      );
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

      if (debug.enabled) {
        let debugString = 'Running http handler:';
        if (node.contentType) {
          debugString += ` content-type: "${node.contentType}"`;
        }
        if (node.contentLanguage) {
          debugString += ` content-language: "${node.contentLanguage}"`;
        }
        if (node.statusCode) {
          debugString += ` code: "${node.statusCode}"`;
        }
        debug(debugString);
      }

      const result = await this.processStatements(node.statements);

      return [true, result];
    };

    return [handler, node.contentType];
  }

  async visitInlineCallNode(
    node: InlineCallNode
  ): Promise<Variables | undefined> {
    if (hasIteration(node)) {
      const results: (Variables | undefined)[] = [];
      const processResult = (result?: Variables) => {
        results.push(result);
      };
      await this.iterate(node, processResult);

      return results;
    }

    if (node.condition) {
      const condition = await this.visit(node.condition);
      if (condition === false) {
        return undefined;
      }
    }

    return this.visitCallCommon(node);
  }

  async visitIterationAtomNode(
    node: IterationAtomNode
  ): Promise<IterationDefinition> {
    const iterable = await this.visit(node.iterable);
    if (isIterable(iterable)) {
      return {
        iterationVariable: node.iterationVariable,
        iterable,
      };
    } else {
      throw new MapASTError(
        `Result of expression: ${node.iterable.expression} is not iterable.`,
        { node, ast: this.ast }
      );
    }
  }

  visitJessieExpressionNode(node: JessieExpressionNode): Variables | undefined {
    try {
      const result = evalScript(node.expression, this.variables);

      return castToVariables(result);
    } catch (e) {
      throw new JessieError('Error in Jessie script', e, {
        node,
        ast: this.ast,
      });
    }
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
          if (this.stackTop.terminate) {
            return this.stackTop.result;
          }
          break;

        case 'OutcomeStatement': {
          const outcome = await this.visit(statement);
          if (outcome?.error) {
            const error = new MappedHTTPError(
              'Expected HTTP error',
              undefined,
              { node: statement, ast: this.ast },
              outcome?.result
            );
            this.stackTop.error = error;
          }
          result = outcome?.result ?? result;
          if (outcome?.terminateFlow) {
            this.stackTop.terminate = true;

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

    if (this.stackTop.error) {
      throw this.stackTop.error;
    }

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
    for (const operation of node.definitions.filter(
      isOperationDefinitionNode
    )) {
      this.operations[operation.name] = operation;
    }
    const operation = node.definitions
      .filter(isMapDefinitionNode)
      .find(definition => definition.usecaseName === this.parameters.usecase);

    if (!operation) {
      throw new MapASTError(`Usecase not found!`, {
        node,
        ast: this.ast,
      });
    }

    return await this.visit(operation);
  }

  visitMapHeaderNode(_node: MapHeaderNode): never {
    throw new UnexpectedError('Method not implemented.');
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

    // this.addVariableToStack({ outcome: { data: this.stackTop.result } });
    const result = await this.visit(node.value);

    return {
      result,
      error: node.isError,
      terminateFlow: node.terminateFlow,
    };
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

  private get variables(): NonPrimitive {
    let variables: NonPrimitive = {};

    for (const stacktop of this.stack) {
      variables = mergeVariables(variables, stacktop.variables);
    }

    if (this.stackTop.result) {
      variables = {
        ...variables,
        outcome: {
          data: this.stackTop.result,
        },
      };
    }

    variables = {
      ...variables,
      input: {
        ...(this.parameters.input ?? {}),
      },
    };

    return variables;
  }

  private addVariableToStack(variables: NonPrimitive): void {
    this.stackTop.variables = mergeVariables(
      this.stackTop.variables,
      variables
    );

    debug('Updated stack:', this.stackTop);
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
    debug('Constructing object:', keys.join('.'), '=', value);

    return result;
  }

  private newStack(type: Stack['type']): void {
    this.stack.push({ type, variables: {}, result: {}, terminate: false });
    debug('New stack:', this.stackTop);
  }

  private popStack(result?: Variables): void {
    const last = this.stack.pop();
    if (this.stack.length > 0 && last) {
      this.stackTop.result = result ?? last.variables['result'];
    }

    debug('Popped stack:', last);
  }

  private get stackTop(): Stack {
    if (this.stack.length === 0) {
      throw new UnexpectedError('Trying to get variables out of scope!');
    }

    return this.stack[this.stack.length - 1];
  }

  private async visitCallCommon(
    node: InlineCallNode | CallStatementNode
  ): Promise<Variables | undefined> {
    const operation = this.operations[node.operationName];
    if (!operation) {
      throw new MapASTError(`Operation not found: ${node.operationName}`, {
        node,
        ast: this.ast,
      });
    }

    debug('Calling operation:', operation.name);

    this.newStack('operation');
    let args: Variables = {};
    for (const assignment of node.arguments) {
      args = mergeVariables(args, await this.visit(assignment));
    }
    this.addVariableToStack({ args });

    const result = await this.visit(operation);
    this.popStack();

    return result;
  }

  private async iterate<T extends CallStatementNode | InlineCallNode>(
    node: T & { iteration: IterationAtomNode },
    processResult: (result?: Variables) => unknown | Promise<unknown>
  ): Promise<void> {
    const iterationParams = await this.visit(node.iteration);
    for (const variable of iterationParams.iterable) {
      this.addVariableToStack({
        [iterationParams.iterationVariable]: variable,
      });
      if (node.condition) {
        const condition = await this.visit(node.condition);
        if (condition === false) {
          continue;
        }
      }
      const result = await this.visitCallCommon(node);
      await processResult(result);
    }
  }

  private get baseUrl(): string | undefined {
    return this.parameters.superJson?.providers?.[this.parameters.provider]
      .deployments?.[this.parameters.deployment].baseUrl;
  }
}
