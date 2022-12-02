import type {
  AssignmentNode,
  CallStatementNode,
  ConditionAtomNode,
  HttpCallStatementNode,
  HttpRequestNode,
  HttpResponseHandlerNode,
  HttpSecurityRequirement,
  InlineCallNode,
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
import {
  isMapDefinitionNode,
  isOperationDefinitionNode,
} from '@superfaceai/ast';

import type {
  IConfig,
  ICrypto,
  ILogger,
  LogFunction,
  MapInterpreterError} from '../../interfaces';
import {
  isBinaryData,
  isDestructible,
  isInitializable} from '../../interfaces';
import type { NonPrimitive, Primitive, Result, Variables } from '../../lib';
import {
  castToVariables,
  err,
  isNonPrimitive,
  isPrimitive,
  mergeVariables,
  ok,
  UnexpectedError,
} from '../../lib';
import type { IServiceSelector } from '../services';
import type { MapInterpreterExternalHandler } from './external-handler';
import type { AuthCache, HttpResponse, SecurityConfiguration } from './http';
import { HttpClient } from './http';
import type { IFetch } from './http/interfaces';
import {
  HTTPError,
  JessieError,
  MapASTError,
  MappedError,
  MappedHTTPError,
} from './map-interpreter.errors';
import { evalScript } from './sandbox';

const DEBUG_NAMESPACE = 'map-interpreter';

function assertUnreachable(node: never): never;
function assertUnreachable(node: MapASTNode): never {
  throw new UnexpectedError(`Invalid Node kind: ${node.kind}`);
}

function isIterable(input: unknown): input is Iterable<Variables> {
  return (
    typeof input === 'object' && input !== null && (Symbol.iterator in input || Symbol.asyncIterator in input)
  );
}

function hasIteration<T extends CallStatementNode | InlineCallNode>(
  node: T
): node is T & { iteration: IterationAtomNode } {
  return node.iteration !== undefined;
}

export interface MapParameters<
  TInput extends NonPrimitive | undefined = undefined
> {
  usecase?: string;
  input?: TInput;
  parameters?: Record<string, string>;
  services: IServiceSelector;
  security: SecurityConfiguration[];
}

type HttpResponseHandler = (response: HttpResponse) => Promise<boolean>;

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
  queryParameters?: NonPrimitive;
  body?: Variables;
  security: HttpSecurityRequirement[];
}

type StackBase = {
  type: 'operation' | 'map';
  variables: NonPrimitive;
  terminate: boolean;
  result?: Variables;
};

type OperationStack = StackBase & {
  type: 'operation';
  error?: Variables;
};

type MapContext = 'http' | 'none';
type MapStack = StackBase & {
  type: 'map';
  error?: MapInterpreterError;
  context: MapContext[];
};

type Stack = OperationStack | MapStack;

type IterationDefinition = {
  iterationVariable: string;
  iterable: Iterable<Variables>;
};

export class MapInterpreter<TInput extends NonPrimitive | undefined>
  implements MapAstVisitor
{
  private operations: Record<string, OperationDefinitionNode | undefined> = {};
  private stack: Stack[] = [];
  private ast?: MapDocumentNode;

  private readonly http: HttpClient;
  private readonly externalHandler: MapInterpreterExternalHandler;
  private readonly config: IConfig;
  private readonly logger?: ILogger;
  private readonly log: LogFunction | undefined;

  constructor(
    private readonly parameters: MapParameters<TInput>,
    {
      fetchInstance,
      externalHandler,
      config,
      logger,
      crypto,
    }: {
      fetchInstance: IFetch & AuthCache;
      externalHandler?: MapInterpreterExternalHandler;
      config: IConfig;
      crypto: ICrypto;
      logger?: ILogger;
    }
  ) {
    this.http = new HttpClient(fetchInstance, crypto, logger);
    this.externalHandler = externalHandler ?? {};
    this.config = config;
    this.logger = logger;
    this.log = logger?.log(DEBUG_NAMESPACE);
  }

  public async perform(
    ast: MapDocumentNode
  ): Promise<Result<Variables | undefined, MapInterpreterError>> {
    this.ast = ast;
    if (this.parameters.input !== undefined) {
      await this.initializeInput(this.parameters.input);
    }

    try {
      const result = await this.visit(ast);

      if (result.error) {
        return err(result.error);
      }

      if (this.parameters.input !== undefined) {
        await this.destroyInput(this.parameters.input);
      }

      return ok(result.result);
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-explicit-any
      return err(e as any); // TODO: this can be HTTPError, UnexpectedError, MappedError, JessieError, MappedHTTPError, SDKBindError
    }
  }

  public visit(node: PrimitiveLiteralNode): Primitive;
  public async visit(node: ObjectLiteralNode): Promise<NonPrimitive>;
  public async visit(node: SetStatementNode): Promise<void>;
  public async visit(
    node: OutcomeStatementNode
  ): Promise<OutcomeDefinition | undefined>;
  public async visit(node: AssignmentNode): Promise<NonPrimitive>;
  public async visit(node: LiteralNode): Promise<Variables>;
  public async visit(node: ConditionAtomNode): Promise<boolean>;
  public async visit(node: HttpRequestNode): Promise<HttpRequest>;
  public async visit(node: InlineCallNode): Promise<Variables | undefined>;
  public async visit(node: IterationAtomNode): Promise<IterationDefinition>;
  public visit(node: HttpResponseHandlerNode): HttpResponseHandlerDefinition;
  public visit(node: JessieExpressionNode): Variables | Primitive | undefined;
  public async visit(
    node: MapDocumentNode
  ): Promise<{ result?: Variables; error?: MapInterpreterError }>;
  public async visit(node: MapASTNode): Promise<Variables | undefined>;
  public visit(
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
    this.log?.(
      'Visiting node:',
      node.kind,
      node.location
        ? `Line: ${node.location.start.line}, Column: ${node.location.start.column}`
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

  public async visitAssignmentNode(
    node: AssignmentNode
  ): Promise<NonPrimitive> {
    const result = await this.visit(node.value);

    return this.constructObject(node.key, result);
  }

  public async visitConditionAtomNode(
    node: ConditionAtomNode
  ): Promise<boolean> {
    const result = await this.visit(node.expression);

    return Boolean(result);
  }

  public async visitCallStatementNode(node: CallStatementNode): Promise<void> {
    if (hasIteration(node)) {
      const processResults = async (result?: Variables, error?: Variables) => {
        if (error !== undefined) {
          this.addVariableToStack({ outcome: { error } });
          this.stackTop().terminate = true;
        } else {
          this.addVariableToStack({ outcome: { data: result } });
        }
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
      const outcome = await this.visitCallCommon(node);

      this.addVariableToStack({ outcome });
      await this.processStatements(node.statements);
    }
  }

  public async visitHttpCallStatementNode(
    node: HttpCallStatementNode
  ): Promise<void> {
    // if node.serviceId is undefined returns the default service, or undefined if no default service is defined
    const serviceUrl = this.parameters.services.getUrl(node.serviceId);
    if (serviceUrl === undefined) {
      throw new UnexpectedError(
        'Base url for a service not provided for HTTP call.'
      );
    }

    const request = node.request && (await this.visit(node.request));
    const responseHandlers = node.responseHandlers.map(responseHandler =>
      this.visit(responseHandler)
    );

    let accept: string;
    if (responseHandlers.some(([, accept]) => accept === undefined)) {
      accept = '*/*';
    } else {
      const accepts = responseHandlers.map(([, accept]) => accept);
      accept = accepts
        // deduplicate the array
        .filter((accept, index) => accepts.indexOf(accept) === index)
        .join(', ');
    }

    let retry = true;
    while (retry) {
      this.log?.('Performing http request:', node.url);
      const response = await this.http.request(node.url, {
        method: node.method,
        headers: request?.headers,
        contentType: request?.contentType ?? 'application/json',
        accept,
        baseUrl: serviceUrl,
        queryParameters: request?.queryParameters,
        pathParameters: this.variables,
        body: request?.body,
        securityRequirements: request?.security,
        securityConfiguration: this.parameters.security,
        integrationParameters: this.parameters.parameters,
      });

      for (const [handler] of responseHandlers) {
        const match = await handler(response);

        if (match) {
          return;
        }
      }

      if (this.externalHandler.unhandledHttp !== undefined) {
        const action =
          (await this.externalHandler.unhandledHttp?.(
            this.ast,
            node,
            response
          )) ?? 'continue';
        if (action !== 'retry') {
          retry = false;
        }
      } else {
        retry = false;
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
    }
  }

  public async visitHttpRequestNode(
    node: HttpRequestNode
  ): Promise<HttpRequest> {
    return {
      contentType: node.contentType,
      contentLanguage: node.contentLanguage,
      headers: node.headers && (await this.visit(node.headers)),
      queryParameters: node.query && (await this.visit(node.query)),
      body: node.body && (await this.visit(node.body)),
      security: node.security,
    };
  }

  public visitHttpResponseHandlerNode(
    node: HttpResponseHandlerNode
  ): HttpResponseHandlerDefinition {
    const handler: HttpResponseHandler = async (response: HttpResponse) => {
      if (
        node.statusCode !== undefined &&
        node.statusCode !== response.statusCode
      ) {
        return false;
      }

      if (
        node.contentType !== undefined &&
        response.headers['content-type'] &&
        !response.headers['content-type'].includes(node.contentType)
      ) {
        return false;
      }

      if (
        node.contentLanguage !== undefined &&
        response.headers['content-language'] &&
        !response.headers['content-language'].includes(node.contentLanguage)
      ) {
        return false;
      }

      {
        const stackTop = this.stackTop();
        if (stackTop.type === 'map') {
          stackTop.context.push('http');
        }
      }

      this.addVariableToStack({
        body: castToVariables(response.body),
        headers: castToVariables(response.headers),
        statusCode: response.statusCode,
      });

      if (this.log?.enabled === true) {
        let debugString = 'Running http handler:';
        if (node.contentType !== undefined) {
          debugString += ` content-type: "${node.contentType}"`;
        }
        if (node.contentLanguage !== undefined) {
          debugString += ` content-language: "${node.contentLanguage}"`;
        }
        if (node.statusCode !== undefined) {
          debugString += ` code: "${node.statusCode}"`;
        }
        this.log(debugString);
      }

      await this.processStatements(node.statements);
      {
        const stackTop = this.stackTop();
        if (stackTop.type === 'map') {
          stackTop.context.pop();
        }
      }

      return true;
    };

    return [handler, node.contentType];
  }

  public async visitInlineCallNode(
    node: InlineCallNode
  ): Promise<Variables | undefined> {
    if (hasIteration(node)) {
      const results: (Variables | undefined)[] = [];
      const processResult = (result?: Variables, error?: Variables) => {
        if (error !== undefined) {
          throw new MapASTError('Unexpected inline call failure.', {
            ast: this.ast,
            node,
          });
        }

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

    const result = await this.visitCallCommon(node);

    return result.data;
  }

  public async visitIterationAtomNode(
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

  public visitJessieExpressionNode(
    node: JessieExpressionNode
  ): Variables | undefined {
    try {
      const result = evalScript(
        this.config,
        node.expression,
        this.logger,
        this.variables
      );

      return castToVariables(result);
    } catch (e) {
      if (e instanceof Error) {
        throw new JessieError('Error in Jessie script', e, {
          node,
          ast: this.ast,
        });  
      }

      throw e;
    }
  }

  public visitPrimitiveLiteralNode(node: PrimitiveLiteralNode): Primitive {
    return node.value;
  }

  private async processStatements(statements: Substatement[]): Promise<void> {
    for (const statement of statements) {
      switch (statement.kind) {
        case 'SetStatement':
        case 'HttpCallStatement':
        case 'CallStatement':
          await this.visit(statement);
          if (this.stackTop().terminate) {
            return;
          }
          break;

        case 'OutcomeStatement': {
          const outcome = await this.visit(statement);
          if (outcome !== undefined && outcome.error) {
            const stackTop = this.stackTop();
            if (stackTop.type === 'map') {
              let error: MapInterpreterError;
              if (stackTop.context[stackTop.context.length - 1] === 'http') {
                const statusCode = this.stackTop('map').variables.statusCode;
                error = new MappedHTTPError(
                  'Expected HTTP error',
                  { node: statement, ast: this.ast },
                  typeof statusCode === 'number' ? statusCode : undefined,
                  outcome?.result
                );
              } else {
                error = new MappedError(
                  'Expected error',
                  { node: statement, ast: this.ast },
                  outcome?.result
                );
              }

              this.stackTop('map').error = error;
            } else {
              this.stackTop('operation').error = outcome.result;
            }
          } else {
            this.stackTop().result = outcome?.result ?? this.stackTop().result;
          }
          this.log?.('Setting result: %O', this.stackTop());

          if (outcome?.terminateFlow === true) {
            this.stackTop().terminate = true;

            return;
          }

          break;
        }
      }
    }
  }

  public async visitMapDefinitionNode(
    node: MapDefinitionNode
  ): Promise<Variables | undefined> {
    this.newStack('map');
    await this.processStatements(node.statements);

    if (this.stackTop().error !== undefined) {
      throw this.stackTop().error;
    }

    return {
      result: this.stackTop().result,
    };
  }

  public async visitMapDocumentNode(
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
      throw new MapASTError(
        `Usecase not found: ${this.parameters.usecase ?? 'undefined'}!`,
        {
          node,
          ast: this.ast,
        }
      );
    }

    return await this.visit(operation);
  }

  public visitMapHeaderNode(_node: MapHeaderNode): never {
    throw new UnexpectedError('Method not implemented.');
  }

  public async visitObjectLiteralNode(
    node: ObjectLiteralNode
  ): Promise<NonPrimitive> {
    let result: NonPrimitive = {};

    for (const field of node.fields) {
      result = mergeVariables(
        result,
        this.constructObject(field.key, await this.visit(field.value))
      );
    }

    return result;
  }

  public async visitOperationDefinitionNode(
    node: OperationDefinitionNode
  ): Promise<void> {
    await this.processStatements(node.statements);
  }

  public async visitOutcomeStatementNode(
    node: OutcomeStatementNode
  ): Promise<OutcomeDefinition | undefined> {
    if (node.condition) {
      const condition = await this.visit(node.condition);

      if (condition === false) {
        return undefined;
      }
    }

    const result = await this.visit(node.value);

    return {
      result:
        this.stackTop().type === 'map'
          ? await this.resolveVariables(result)
          : result,
      error: node.isError,
      terminateFlow: node.terminateFlow,
    };
  }

  public async visitSetStatementNode(node: SetStatementNode): Promise<void> {
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
    let variables: NonPrimitive = this.stackTop().variables;

    // for (const stacktop of this.stack) {
    //   variables = mergeVariables(variables, stacktop.variables);
    // }

    // if (this.stackTop.result) {
    //   variables = {
    //     ...variables,
    //     outcome: {
    //       data: this.stackTop.result,
    //     },
    //   };
    // }

    variables = {
      ...variables,
      input: {
        ...(this.parameters.input ?? {}),
      },
      parameters: {
        ...(this.parameters.parameters ?? {}),
      },
    };

    return variables;
  }

  private addVariableToStack(variables: NonPrimitive): void {
    this.stackTop().variables = mergeVariables(
      this.stackTop().variables,
      variables
    );

    this.log?.('Updated stack: %O', this.stackTop());
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
    this.log?.('Constructing object:', keys.join('.'), '=', value);

    return result;
  }

  private newStack(type: Stack['type']): void {
    const stack =
      type === 'map'
        ? {
            type,
            variables: {},
            result: undefined,
            terminate: false,
            context: [],
          }
        : {
            type,
            variables: {},
            result: undefined,
            terminate: false,
          };
    this.stack.push(stack);
    this.log?.('New stack: %O', this.stackTop());
  }

  private popStack(): void {
    const last = this.stack.pop();

    this.log?.('Popped stack: %O', last);
  }

  private stackTop(assertType: 'operation'): OperationStack;
  private stackTop(assertType: 'map'): MapStack;
  private stackTop(): Stack;
  private stackTop(assertType?: 'map' | 'operation'): Stack {
    if (this.stack.length === 0) {
      throw new UnexpectedError('Trying to get variables out of scope!');
    }
    const stack = this.stack[this.stack.length - 1];

    if (assertType !== undefined && stack.type !== assertType) {
      throw new UnexpectedError(
        `Trying to get '${assertType}', but got ${stack.type}!`
      );
    }

    return stack;
  }

  private async visitCallCommon(
    node: InlineCallNode | CallStatementNode
  ): Promise<{ data: Variables | undefined; error?: Variables | undefined }> {
    const operation = this.operations[node.operationName];
    if (!operation) {
      throw new MapASTError(`Operation not found: ${node.operationName}`, {
        node,
        ast: this.ast,
      });
    }

    this.log?.('Calling operation:', operation.name);

    let args: Variables = {};
    for (const assignment of node.arguments) {
      args = mergeVariables(args, await this.visit(assignment));
    }
    this.newStack('operation');
    this.addVariableToStack({ args });

    await this.visit(operation);
    const { result: data, error } = this.stackTop('operation');

    this.popStack();

    return { data, error };
  }

  private async iterate<T extends CallStatementNode | InlineCallNode>(
    node: T & { iteration: IterationAtomNode },
    processResult: (
      result?: Variables,
      error?: Variables
    ) => unknown | Promise<unknown>
  ): Promise<void> {
    const iterationParams = await this.visit(node.iteration);
    for await (const variable of iterationParams.iterable) {
      // overwrite the iteration variable instead of merging
      this.stackTop().variables[iterationParams.iterationVariable] = variable;

      if (node.condition) {
        const condition = await this.visit(node.condition);
        if (condition === false) {
          continue;
        }
      }
      const result = await this.visitCallCommon(node);

      await processResult(result.data, result.error);
      // return early check
      if (this.stackTop().terminate) {
        break;
      }
    }
  }

  private async initializeInput(input: NonPrimitive): Promise<void> {
    for (const value of Object.values(input)) {
      if (isInitializable(value)) {
        await value.initialize();
      } else if (value !== undefined && isNonPrimitive(value)) {
        await this.initializeInput(value);
      }
    }
  }

  private async destroyInput(input: NonPrimitive): Promise<void> {
    for (const value of Object.values(input)) {
      if (isDestructible(value)) {
        await value.destroy();
      } else if (value !== undefined && isNonPrimitive(value)) {
        await this.destroyInput(value);
      }
    }
  }

  private async resolveVariables(
    input: Variables | undefined
  ): Promise<Variables | undefined> {
    if (isBinaryData(input)) {      
      return await input.getAllData(); // resolve to return Buffer, but it doesnt work
    }

    if (input === undefined || isPrimitive(input)) {
      return input;
    }

    const result: Variables = {};
    for (const [key, value] of Object.entries(input)) {
      result[key] = await this.resolveVariables(value);
    }

    return result;
  }
}
