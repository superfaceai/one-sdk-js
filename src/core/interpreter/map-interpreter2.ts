import type {
  AssignmentNode,
  HttpCallStatementNode,
  HttpResponseHandlerNode,
  HttpSecurityRequirement,
  MapASTNode,
  MapDefinitionNode,
  MapDocumentNode,
  PrimitiveLiteralNode,
  SetStatementNode
} from '@superfaceai/ast';
import {
  isMapDefinitionNode,
} from '@superfaceai/ast';

import type {
  IConfig,
  ICrypto,
  ILogger,
  LogFunction,
  MapInterpreterError,
} from '../../interfaces';
import { castToVariables, isNonPrimitive, mergeVariables, NonPrimitive, Result, UnexpectedError, Variables } from '../../lib';
import type { IServiceSelector } from '../services';
import type { MapInterpreterExternalHandler } from './external-handler';
import type { AuthCache, SecurityConfiguration } from './http';
import { HttpClient } from './http';
import type { IFetch } from './http/interfaces';
import { HTTPError, MapASTError } from './map-interpreter.errors';

const DEBUG_NAMESPACE = 'map-interpreter2';

export interface MapParameters<
  TInput extends NonPrimitive | undefined = undefined
  > {
  usecase?: string;
  input?: TInput;
  parameters?: Record<string, string>;
  services: IServiceSelector;
  security: SecurityConfiguration[];
}

type VisitorOutcomeValue = { result: Variables } | { error: Variables }

/** Another node to explore in depth-first fashion. */
type VisitorResultExplore = {
  kind: 'explore'
  /** Node to explore next depth-first. */
  node: MapASTNode
  /** Initial variable stack passed to the child. */
  stack: NonPrimitive
  /** Identifier assigned to the child by the parent - TODO: for debugging for now. */
  childIdentifier: string,
}
/** Final result of this visitor - this visitor is done. */
type VisitorResultDone = {
  kind: 'done',
  /** Updated variable stack value. */
  stack: NonPrimitive
  /** Identifier assigned to the child by its parent. */
  childIdentifier: string
  /** The return value to be given to the parent node. */
  value?: unknown
  /** The outcome passed to nearest Map/Operation ancestor. */
  outcome?: { terminate: boolean, value: VisitorOutcomeValue }
}
/** Yield result of this visitor - the current map/operation should yield a value but this visitor is not done. */
type VisitorResultYield = {
  kind: 'yield',
  /** The value to yield up to the nearest Map/Operation. */
  value: { kind: 'outcome' } & VisitorOutcomeValue
}

type VisitorGenerator = AsyncGenerator<VisitorResultExplore | VisitorResultYield, VisitorResultDone, VisitorResultDone>;
abstract class NodeVisitor<N extends MapASTNode> implements VisitorGenerator {
  protected static mergeOutcome(current: VisitorOutcomeValue | undefined, other: VisitorOutcomeValue): VisitorOutcomeValue {
    if ('error' in other) {
      return { error: other.error }
    } else if (current !== undefined && 'error' in current) {
      return { error: current.error }
    } else {
      return { result: other.result }
    }
  }

  protected outcome: VisitorOutcomeValue | undefined = undefined
  constructor(
    protected readonly node: N,
    protected stack: NonPrimitive,
    protected readonly childIdentifier: string,
    protected readonly log: LogFunction | undefined
  ) { }

  protected prepareResultDone(value?: unknown, terminate?: boolean): VisitorResultDone {
    let outcome = undefined
    if (terminate !== undefined) {
      if (this.outcome === undefined) {
        throw new UnexpectedError('Expected outcome to be set')
      }

      outcome = { terminate, value: this.outcome }
    }
    
    return {
      kind: 'done',
      stack: this.stack,
      childIdentifier: this.childIdentifier,
      value,
      outcome
    }
  }

  // Helps implementors use the generator syntax.
  protected abstract visit(): VisitorGenerator

  // TODO: signature unsure, resolve later
  // abstract childYield(result: VisitorResultYield): undefined | VisitorResultYield

  private visitGenerator?: VisitorGenerator = undefined
  private expectedChildIdentifier?: string = undefined
  async next(...args: [] | [VisitorResultDone]): Promise<IteratorResult<VisitorResultExplore | VisitorResultYield, VisitorResultDone>> {
    if (this.visitGenerator === undefined) {
      this.visitGenerator = this.visit()
    }

    // here we check child identifier as a sanity check
    const actualChildIdentifier = args[0]?.childIdentifier
    if (this.expectedChildIdentifier !== actualChildIdentifier) {
      throw new UnexpectedError(`Sanity check failed in ${this.toString()}: Expected child identifier "${this.expectedChildIdentifier}" but found "${actualChildIdentifier}"`)
    }

    // TODO: here we can merge outcome - do we want to do it in all cases?
    // TODO: here we can merge/overwrite stacks - do we want to do it in all cases?

    const result = await this.visitGenerator.next(...args)

    // store last childIdentifier
    if (result.value.kind === "explore") {
      this.expectedChildIdentifier = result.value.childIdentifier
    } else {
      this.expectedChildIdentifier = undefined
    }
    
    return result
  }

  return(_value: VisitorResultDone | PromiseLike<VisitorResultDone>): Promise<IteratorResult<VisitorResultExplore | VisitorResultYield, VisitorResultDone>> {
    throw new Error('Method not implemented.')
  }
  throw(_e: any): Promise<IteratorResult<VisitorResultExplore | VisitorResultYield, VisitorResultDone>> {
    throw new Error('Method not implemented.')
  }
  [Symbol.asyncIterator](): AsyncGenerator<VisitorResultExplore | VisitorResultYield, VisitorResultDone, VisitorResultDone> {
    return this
  }

  abstract [Symbol.toStringTag](): string

  toString(): string {
    return `${this[Symbol.toStringTag]()}(${this.childIdentifier})`
  }
}

class MapDefinitionVisitor extends NodeVisitor<MapDefinitionNode> {
  override async * visit(): VisitorGenerator {
    for (let i = 0; i < this.node.statements.length; i += 1) {
      const result = yield {
        kind: 'explore',
        node: this.node.statements[i],
        stack: this.stack,
        childIdentifier: `${this.childIdentifier}.statements[${i}]`
      };

      this.stack = result.stack;

      if (result.outcome !== undefined) {
        this.outcome = NodeVisitor.mergeOutcome(this.outcome, result.outcome.value)

        if (result.outcome.terminate) {
          return this.prepareResultDone(undefined, true)
        }
      }
    }

    return this.prepareResultDone(undefined, false)
  }

  override [Symbol.toStringTag](): string {
    return 'MapDefinitionVisitor'
  }
}

class SetStatementVisitor extends NodeVisitor<SetStatementNode> {
  override async * visit(): VisitorGenerator {
    if (this.node.condition !== undefined) {
      const result = yield {
        kind: 'explore',
        node: this.node.condition,
        stack: this.stack,
        childIdentifier: `${this.childIdentifier}.condition`
      };

      // TODO: assert is boolean?
      if (result.value === false) {
        return this.prepareResultDone(undefined)
      }
    }

    for (let i = 0; i < this.node.assignments.length; i += 1) {
      const result = yield {
        kind: 'explore',
        node: this.node.assignments[i],
        stack: this.stack,
        childIdentifier: `${this.childIdentifier}.assignments[${i}]`
      };

      if (result.value === undefined) {
        throw 'TODO'
      }
      this.log?.('Updating stack with:', result.value);
      
      // TODO: this is different from before - it allows consecutive assignments to see values from previous ones
      // TODO: assert value.intermediate is NonPrimitive
      this.stack = mergeVariables(this.stack, result.value as NonPrimitive)
    }

    return this.prepareResultDone(undefined)
  }

  override [Symbol.toStringTag](): string {
    return 'SetStatementVisitor'
  }
}

class AssignmentVisitor extends NodeVisitor<AssignmentNode> {
  private static constructObject(keys: string[], value: Variables): NonPrimitive {
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
  
  override async * visit(): VisitorGenerator {
    const result = yield {
      kind: 'explore',
      node: this.node.value,
      stack: this.stack,
      childIdentifier: `${this.childIdentifier}.value`
    };

    // TODO: assert result.value is Variables
    const object = AssignmentVisitor.constructObject(this.node.key, result.value as Variables)

    return this.prepareResultDone(object)
  }

  override [Symbol.toStringTag](): string {
    return 'AssignmentVisitor'
  }
}

class PrimitiveLiteralVisitor extends NodeVisitor<PrimitiveLiteralNode> {
  override async * visit(): VisitorGenerator {
    return this.prepareResultDone(this.node.value)
  }

  override [Symbol.toStringTag](): string {
    return 'PrimitiveLiteralVisitor'
  }
}

type HttpRequest = {
  contentType?: string;
  contentLanguage?: string;
  headers?: Variables;
  queryParameters?: NonPrimitive;
  body?: Variables;
  security: HttpSecurityRequirement[];
}

class HttpCallStatementVisitor extends NodeVisitor<HttpCallStatementNode> {
  constructor(
    node: HttpCallStatementNode,
    stack: NonPrimitive,
    childIdentifier: string,
    log: LogFunction | undefined,
    private readonly http: HttpClient,
    private readonly externalHandler: MapInterpreterExternalHandler,
    private readonly services: IServiceSelector,
    private readonly integrationParameters: Record<string, string> | undefined,
    private readonly securityConfiguration: SecurityConfiguration[]
  ) {
    super(node, stack, childIdentifier, log)
  }
  
  override async * visit(): VisitorGenerator {
    // if node.serviceId is undefined returns the default service, or undefined if no default service is defined
    const serviceUrl = this.services.getUrl(this.node.serviceId);
    if (serviceUrl === undefined) {
      throw new UnexpectedError(
        'Base url for a service not provided for HTTP call.'
      );
    }

    let request: HttpRequest | undefined
    if (this.node.request) {
      const result = yield {
        kind: 'explore',
        node: this.node.request,
        stack: this.stack,
        childIdentifier: `${this.childIdentifier}.request`
      };

      request = result.value as HttpRequest
    }

    const accepts = this.node.responseHandlers.map(node => node.contentType)
    let accept = '';
    if (accepts.some(accept => accept === undefined)) {
      accept = '*/*';
    } else {
      accept = accepts
        // deduplicate the array
        .filter((accept, index) => accepts.indexOf(accept) === index)
        .join(', ');
    }

    let retry = true;
    while (retry) {
      this.log?.('Performing http request:', this.node.url);
      const response = await this.http.request(this.node.url, {
        method: this.node.method,
        headers: request?.headers,
        contentType: request?.contentType ?? 'application/json',
        accept,
        baseUrl: serviceUrl,
        queryParameters: request?.queryParameters,
        pathParameters: this.stack,
        body: request?.body,
        securityRequirements: request?.security,
        securityConfiguration: this.securityConfiguration,
        integrationParameters: this.integrationParameters,
      });

      for (let i = 0; i < this.node.responseHandlers.length; i += 1) {
        this.stack = mergeVariables(this.stack, {
          body: castToVariables(response.body),
          headers: castToVariables(response.headers),
          statusCode: response.statusCode
        });
        const result = yield {
          kind: 'explore',
          node: this.node.responseHandlers[i],
          stack: this.stack,
          childIdentifier: `${this.childIdentifier}.response[${i}]`
        };
        
        if (result.outcome !== undefined) {
          this.outcome = NodeVisitor.mergeOutcome(this.outcome, result.outcome.value);

          if (result.outcome.terminate) {
            return this.prepareResultDone(undefined, true)
          }
        }

        if (result.value === true) {
          break;
        }
      }

      if (this.externalHandler.unhandledHttp !== undefined) {
        const action =
          (await this.externalHandler.unhandledHttp?.(
            undefined, // TODO: can we perform error handling some other way?
            this.node,
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
            { node: this.node, ast: undefined }, // TODO
            response.statusCode,
            response.debug.request,
            { body: response.body, headers: response.headers }
          );
        }
      }
    }

    return this.prepareResultDone(undefined)
  }
  
  override [Symbol.toStringTag](): string {
    return 'HttpCallStatementVisitor'
  }
}

class HttpResponseHandlerVisitor extends NodeVisitor<HttpResponseHandlerNode> {
  private matchResponse(): boolean {
    if (
      this.node.statusCode !== undefined &&
      this.node.statusCode !== this.stack.statusCode
    ) {
      return false;
    }

    const headers = this.stack.headers;
    if (headers === undefined || !isNonPrimitive(headers)) {
      throw new UnexpectedError('Stack needs to contain "headers" when visiting HttpResponseHandler');
    }

    const contentType = headers['content-type']
    if (
      this.node.contentType !== undefined &&
      typeof contentType === 'string' && !contentType.includes(this.node.contentType)
    ) {
      return false;
    }

    const contentLanguage = headers['content-language']
    if (
      this.node.contentLanguage !== undefined &&
      typeof contentLanguage === 'string' && !contentLanguage.includes(this.node.contentLanguage)
    ) {
      return false;
    }

    return true;
  }
  
  override async * visit(): VisitorGenerator {
    if (!this.matchResponse()) {
      return this.prepareResultDone(false)
    }

    if (this.log?.enabled === true) {
      let debugString = 'Running http handler:';
      if (this.node.contentType !== undefined) {
        debugString += ` content-type: "${this.node.contentType}"`;
      }
      if (this.node.contentLanguage !== undefined) {
        debugString += ` content-language: "${this.node.contentLanguage}"`;
      }
      if (this.node.statusCode !== undefined) {
        debugString += ` code: "${this.node.statusCode}"`;
      }
      this.log(debugString);
    }

    for (let i = 0; i < this.node.statements.length; i += 1) {
      const result = yield {
        kind: 'explore',
        node: this.node.statements[i],
        stack: this.stack,
        childIdentifier: `${this.childIdentifier}.statements[${i}]`
      };

      this.stack = result.stack;

      if (result.outcome !== undefined) {
        this.outcome = NodeVisitor.mergeOutcome(this.outcome, result.outcome.value)

        if (result.outcome.terminate) {
          return this.prepareResultDone(undefined, true)
        }
      }
    }

    return this.prepareResultDone(true)
  }

  override [Symbol.toStringTag](): string {
    return 'HttpResponseHandlerVisitor'
  }
}

export class MapInterpreter2<TInput extends NonPrimitive | undefined> {
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
    const iter = this.performStream(ast)

    const result = await iter.next()
    const next = await iter.next()
    if (result.done === true || result.value === undefined || next.done !== true) {
      throw new Error('TODO')
    }

    return result.value
  }

  public async * performStream(
    ast: MapDocumentNode
  ): AsyncIterableIterator<Result<Variables | undefined, MapInterpreterError>> {
    void this.http
    void this.externalHandler
    void this.config
    void this.logger

    // setup
    // const operations: Record<string, OperationDefinitionNode | undefined> = Object.fromEntries(
    // 	ast.definitions.filter(isOperationDefinitionNode).map(op => [op.name, op])
    // );
    const entry = this.findEntry(ast);

    // create a visitor of the root node and put it on the stack
    const nodeStack: NodeVisitor<MapASTNode>[] = [
      this.createVisitor(entry, {}, "root")
    ];

    // drive nodes from the stack until empty
    let lastResult: VisitorResultDone | undefined = undefined
    while (nodeStack.length > 0) {
      const current = nodeStack[nodeStack.length - 1]

      this.log?.(current.toString(), '<', lastResult)
      let step: IteratorResult<VisitorResultExplore | VisitorResultYield, VisitorResultDone> = await current.next(lastResult as any)
      this.log?.(current.toString(), '>', step.value)
      
      lastResult = undefined
      switch (step.value.kind) {
        case 'explore':
          nodeStack.push(this.createVisitor(step.value.node, step.value.stack, step.value.childIdentifier));
          break;

        case 'done':
          nodeStack.pop();
          lastResult = step.value;
          break;

        case 'yield':
          throw new Error('TODO')
      }
    }
  }

  private findEntry(ast: MapDocumentNode): MapDefinitionNode {
    const entry = ast.definitions
      .filter(isMapDefinitionNode)
      .find(definition => definition.usecaseName === this.parameters.usecase);

    if (entry === undefined) {
      throw new MapASTError(
        `Usecase not found: ${this.parameters.usecase ?? 'undefined'}!`,
        { node: ast, ast }
      );
    }

    return entry
  }

  private createVisitor(node: MapASTNode, stack: NonPrimitive, childIdentifier: string): NodeVisitor<MapASTNode> {
    this.log?.(
      'Visiting node:',
      node.kind,
      node.location
        ? `Line: ${node.location.start.line}, Column: ${node.location.start.column}`
        : ''
    );
    
    switch (node.kind) {
      case 'MapDefinition':
        return new MapDefinitionVisitor(node, stack, childIdentifier, this.log)
      
      case 'SetStatement':
        return new SetStatementVisitor(node, stack, childIdentifier, this.log)
      
      case 'Assignment':
        return new AssignmentVisitor(node, stack, childIdentifier, this.log)

      case 'PrimitiveLiteral':
        return new PrimitiveLiteralVisitor(node, stack, childIdentifier, this.log)
      
      case 'HttpCallStatement':
        return new HttpCallStatementVisitor(node, stack, childIdentifier, this.log, this.http, this.externalHandler, this.parameters.services, this.parameters.parameters, this.parameters.security)

      case 'HttpResponseHandler':
        return new HttpResponseHandlerVisitor(node, stack, childIdentifier, this.log)

      default:
        throw new UnexpectedError('TODO')
        // assertUnreachable(node);
    }
  }
}

// function assertUnreachable(node: never): never {
//   throw ''
// }