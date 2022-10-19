import {
  AssignmentNode,
  CallStatementNode,
  ConditionAtomNode,
  HttpCallStatementNode,
  HttpResponseHandlerNode,
  HttpSecurityRequirement,
  InlineCallNode,
  isOperationDefinitionNode,
  IterationAtomNode,
  JessieExpressionNode,
  MapASTNode,
  MapDefinitionNode,
  MapDocumentNode,
  ObjectLiteralNode,
  OperationDefinitionNode,
  OutcomeStatementNode,
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
import { assertIsVariables, castToVariables, err, isNonPrimitive, mergeVariables, NonPrimitive, ok, Result, UnexpectedError, Variables } from '../../lib';
import type { IServiceSelector } from '../services';
import type { MapInterpreterExternalHandler } from './external-handler';
import type { AuthCache, SecurityConfiguration } from './http';
import { HttpClient } from './http';
import type { IFetch } from './http/interfaces';
import { HTTPError, JessieError, MapASTError } from './map-interpreter.errors';
import { evalScript } from './sandbox';

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

type VisitorOutcomeValue = { data: Variables } | { error: Variables }

/** Another node to explore in depth-first fashion. */
type VisitorResultExplore = {
  kind: 'explore'
  /** What (node or operation name) to explore next (depth-first). */
  what: { node: MapASTNode } | { operation: string }
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
      return { data: other.data }
    }
  }

  protected outcome: VisitorOutcomeValue | undefined = undefined
  constructor(
    public readonly node: N,
    protected stack: NonPrimitive,
    protected readonly childIdentifier: string,
    protected readonly log: LogFunction | undefined
  ) { }

  protected prepareResultDone(value?: unknown, terminate?: boolean): VisitorResultDone {
    let outcome = undefined
    if (this.outcome !== undefined) {
      outcome = { terminate: terminate ?? false, value: this.outcome }
    } else if (terminate !== undefined) {
      throw new UnexpectedError('Expected outcome to be set')
    }
    
    return {
      kind: 'done',
      stack: this.stack,
      childIdentifier: this.childIdentifier,
      value,
      outcome
    }
  }

  protected checkMergeOutcome(result: VisitorResultDone): boolean {
    if (result.outcome !== undefined) {
      this.log?.('Merging outcome:', this.outcome, 'with', result.outcome)
      this.outcome = NodeVisitor.mergeOutcome(this.outcome, result.outcome.value)

      if (result.outcome.terminate) {
        return true
      }
    }

    return false
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

    const result = await this.visitGenerator.next(...args)

    // store last childIdentifier
    if (result.value.kind === 'explore') {
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
        what: { node: this.node.statements[i] },
        stack: this.stack,
        childIdentifier: `${this.childIdentifier}.statements[${i}]`
      };

      this.stack = result.stack;

      if (this.checkMergeOutcome(result)) {
        return this.prepareResultDone(undefined, true)
      }
    }

    return this.prepareResultDone(undefined, false)
  }

  override [Symbol.toStringTag](): string {
    return 'MapDefinitionVisitor'
  }
}

class OperationDefinitionVisitor extends NodeVisitor<OperationDefinitionNode> {
  override async * visit(): VisitorGenerator {
    for (let i = 0; i < this.node.statements.length; i += 1) {
      const result = yield {
        kind: 'explore',
        what: { node: this.node.statements[i] },
        stack: this.stack,
        childIdentifier: `${this.childIdentifier}.statements[${i}]`
      };

      this.stack = result.stack;

      if (this.checkMergeOutcome(result)) {
        return this.prepareResultDone(undefined, true)
      }
    }

    return this.prepareResultDone(undefined, false)
  }
  
  override [Symbol.toStringTag](): string {
    return 'OperationDefinitionVisitor'
  }
}

class SetStatementVisitor extends NodeVisitor<SetStatementNode> {
  override async * visit(): VisitorGenerator {
    if (this.node.condition !== undefined) {
      const result = yield {
        kind: 'explore',
        what: { node: this.node.condition },
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
        what: { node: this.node.assignments[i] },
        stack: this.stack,
        childIdentifier: `${this.childIdentifier}.assignments[${i}]`
      };

      if (result.value === undefined) {
        throw 'TODO'
      }
      this.log?.('Updating stack with:', result.value);
      
      // TODO: this is different from before - it allows consecutive assignments to see values from previous ones
      // TODO: assert result.value is NonPrimitive
      this.stack = mergeVariables(this.stack, result.value as NonPrimitive)
    }

    return this.prepareResultDone(undefined)
  }

  override [Symbol.toStringTag](): string {
    return 'SetStatementVisitor'
  }
}

class ConditionAtomVisitor extends NodeVisitor<ConditionAtomNode> {
  override async * visit(): VisitorGenerator {
    const result = yield {
      kind: 'explore',
      what: { node: this.node.expression },
      stack: this.stack,
      childIdentifier: `${this.childIdentifier}.value`,
    };
    
    return this.prepareResultDone(Boolean(result.value))
  }

  override [Symbol.toStringTag](): string {
    return 'ConditionAtomVisitor'
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
      what: { node: this.node.value },
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

class ObjectLiteralVisitor extends NodeVisitor<ObjectLiteralNode> {
  override async * visit(): VisitorGenerator {
    let object: NonPrimitive = {};

    for (let i = 0; i < this.node.fields.length; i += 1) {
      const result = yield {
        kind: 'explore',
        what: { node: this.node.fields[i] },
        stack: this.stack,
        childIdentifier: `${this.childIdentifier}.fields[${i}]`
      };
      
      // TODO: typecheck
      object = mergeVariables(object, result.value as NonPrimitive)
    }

    return this.prepareResultDone(object)
  }
  
  override [Symbol.toStringTag](): string {
    return 'ObjectLiteralVisitor'
  }
}

class JessieExpressionVisitor extends NodeVisitor<JessieExpressionNode> {
  constructor(
    node: JessieExpressionNode,
    stack: NonPrimitive,
    childIdentifier: string,
    log: LogFunction | undefined,
    private readonly config: IConfig,
    private readonly logger: ILogger | undefined,
    private readonly inputParameters: NonPrimitive | undefined,
    private readonly integrationParameters: Record<string, string> | undefined
  ) {
    super(node, stack, childIdentifier, log)
  }
  
  override async * visit(): VisitorGenerator {
    try {
      const result = evalScript(
        this.config,
        this.node.expression,
        this.logger,
        {
          ...this.stack,
          input: {
            ...(this.inputParameters ?? {}),
          },
          parameters: {
            ...(this.integrationParameters ?? {}),
          }
        }
      );

      return this.prepareResultDone(
        castToVariables(result)
      );
    } catch (e) {
      throw new JessieError('Error in Jessie script', e, {
        node: this.node,
        ast: undefined // TODO: error propagation
      });
    }
  }
  
  override [Symbol.toStringTag](): string {
    return 'JessieExpressionVisitor'
  }
}

class IterationAtomVisitor extends NodeVisitor<IterationAtomNode> {
  private static isIterable(input: unknown): input is Iterable<Variables> {
    return (
      typeof input === 'object' && input !== null && Symbol.iterator in input
    );
  }
  
  override async * visit(): VisitorGenerator {
    const result = yield {
      kind: 'explore',
      what: { node: this.node.iterable },
      stack: this.stack,
      childIdentifier: `${this.childIdentifier}.value`,
    };

    if (!IterationAtomVisitor.isIterable(result.value)) {
      throw new MapASTError(
        `Result of expression: ${this.node.iterable.expression} is not iterable.`,
        { node: this.node, ast: undefined } // TODO: error propagation
      );
    }

    return this.prepareResultDone(result.value)
  }
  
  override [Symbol.toStringTag](): string {
    return 'IterationAtomVisitor'
  }
}

class CallVisitor extends NodeVisitor<InlineCallNode | CallStatementNode> {  
  override async * visit(): VisitorGenerator {
    // generalized case for iterated and non-iterated call
    let iterable: Iterable<Variables> = [0]
    let iterationVariable: string | undefined = undefined
    if (this.node.iteration !== undefined) {
      const result = yield {
        kind: 'explore',
        what: { node: this.node.iteration },
        stack: this.stack,
        childIdentifier: `${this.childIdentifier}.iteration`
      };

      iterable = result.value as Iterable<Variables>
      iterationVariable = this.node.iteration.iterationVariable
    }

    let inlineCallResults = []

    let iterationCounter = -1
    for (const iterVariable of iterable) {
      iterationCounter += 1
      const childIdentifier = `${this.childIdentifier}.*${iterationCounter}` // TODO: how to correctly mark repetition?
      
      if (iterationVariable !== undefined) {
        this.stack[iterationVariable] = iterVariable;
      }

      if (this.node.condition !== undefined) {
        const result = yield {
          kind: 'explore',
          what: { node: this.node.condition },
          stack: this.stack,
          childIdentifier: `${childIdentifier}.condition`
        };

        // TODO: typecheck
        if (result.value === false) {
          continue
        }
      }

      this.log?.('Calling operation:', this.node.operationName);
      let args: Variables = {};
      for (let i = 0; i < this.node.arguments.length; i += 1) {
        const result = yield {
          kind: 'explore',
          what: { node: this.node.arguments[i] },
          stack: this.stack,
          childIdentifier: `${childIdentifier}.arguments[${i}]`
        };
        
        // TODO: typecheck
        args = mergeVariables(args, result.value as NonPrimitive)
      }

      const result = yield {
        kind: 'explore',
        what: { operation: this.node.operationName },
        stack: { args },
        childIdentifier: `${childIdentifier}.operation`
      };

      // TODO: typecheck
      const outcome = result.outcome!!.value

      if (this.node.kind === 'InlineCall') {
        if ('error' in outcome) {
          throw new UnexpectedError('Inline call threw', { node: this.node, ast: undefined }) // TODO
        }

        inlineCallResults.push(outcome.data)
      } else if (this.node.kind === 'CallStatement') {
        this.stack['outcome'] = outcome;

        // process statements
        for (let i = 0; i < this.node.statements.length; i += 1) {
          const result = yield {
            kind: 'explore',
            what: { node: this.node.statements[i] },
            stack: this.stack,
            childIdentifier: `${childIdentifier}.statements[${i}]`
          };

          this.stack = result.stack;
          if (this.checkMergeOutcome(result)) {
            return this.prepareResultDone(undefined, true)
          }
        }

        // end early if last outcome was an error
        if ('error' in outcome) {
          break;
        }
      }
    }

    if (this.node.kind === 'InlineCall') {
      if (this.node.iteration === undefined) {
        return this.prepareResultDone(inlineCallResults[0])
      } else {
        return this.prepareResultDone(inlineCallResults)
      }
    } else {
      return this.prepareResultDone(undefined)
    }
  }
  
  override [Symbol.toStringTag](): string {
    return 'CallVisitor'
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
        what: { node: this.node.request },
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
          what: { node: this.node.responseHandlers[i] },
          stack: this.stack,
          childIdentifier: `${this.childIdentifier}.response[${i}]`
        };
        
        if (this.checkMergeOutcome(result)) {
          return this.prepareResultDone(undefined, true)
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
        what: { node: this.node.statements[i] },
        stack: this.stack,
        childIdentifier: `${this.childIdentifier}.statements[${i}]`
      };

      this.stack = result.stack;

      if (this.checkMergeOutcome(result)) {
        return this.prepareResultDone(undefined, true)
      }
    }

    return this.prepareResultDone(true)
  }

  override [Symbol.toStringTag](): string {
    return 'HttpResponseHandlerVisitor'
  }
}

class OutcomeStatementVisitor extends NodeVisitor<OutcomeStatementNode> {
  override async * visit(): VisitorGenerator {
    if (this.node.condition !== undefined) {
      const result = yield {
        kind: 'explore',
        what: { node: this.node.condition },
        stack: this.stack,
        childIdentifier: `${this.childIdentifier}.condition`
      };

      // TODO: assert is boolean?
      if (result.value === false) {
        return this.prepareResultDone(undefined)
      }
    }

    const result = yield {
      kind: 'explore',
      what: { node: this.node.value },
      stack: this.stack,
      childIdentifier: `${this.childIdentifier}.value`
    };
    assertIsVariables(result.value);
    if (result.value === undefined) {
      throw new UnexpectedError('Outcome value is undefined')
    }

    if (this.node.isError) {
      this.outcome = { error: result.value };
    } else {
      this.outcome = { data: result.value };
    }

    return this.prepareResultDone(undefined, this.node.terminateFlow);
  }
  
  override [Symbol.toStringTag](): string {
    return 'OutcomeStatementVisitor'
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
    if (result.done !== true || result.value === undefined ) {
      throw new Error('TODO')
    }

    return result.value
  }

  public async * performStream(
    ast: MapDocumentNode
  ): AsyncGenerator<unknown, Result<Variables | undefined, MapInterpreterError>, undefined> {
    // setup
    const operations: Record<string, OperationDefinitionNode | undefined> = Object.fromEntries(
    	ast.definitions.filter(isOperationDefinitionNode).map(op => [op.name, op])
    );
    const entry = this.findEntry(ast);

    // create a visitor of the root node and put it on the stack
    const nodeStack: NodeVisitor<MapASTNode>[] = [
      this.createVisitor(entry, {}, 'root')
    ];

    // drive nodes from the stack until empty
    let lastResult: VisitorResultDone | undefined = undefined
    while (nodeStack.length > 0) {
      const current = nodeStack[nodeStack.length - 1]

      this.log?.('Stepping', current.toString(), '<<', lastResult)
      let step: IteratorResult<VisitorResultExplore | VisitorResultYield, VisitorResultDone> = await current.next(lastResult as any)
      this.log?.('Yielded', current.toString(), '>>', step.value)
      
      lastResult = undefined
      switch (step.value.kind) {
        case 'explore': {
          let node;
          if ('node' in step.value.what) {
            node = step.value.what.node;
          } else {
            node = operations[step.value.what.operation];
            if (node === undefined) {
              throw new MapASTError(`Operation not found: ${step.value.what.operation}`, { node: current.node, ast });
            }
          }

          nodeStack.push(this.createVisitor(node, step.value.stack, step.value.childIdentifier));
        } break;

        case 'done':
          nodeStack.pop();
          lastResult = step.value;
          break;

        case 'yield':
          throw new Error('TODO')
      }
    }

    if (lastResult?.outcome === undefined) {
      throw new UnexpectedError('Missing outcome', { ast })
    }
    if ('error' in lastResult.outcome.value) {
      return err(lastResult.outcome.value.error as any) // TODO
    } else {
      return ok(lastResult.outcome.value.data)
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

  private createVisitor(
    node: MapASTNode,
    stack: NonPrimitive,
    childIdentifier: string,
  ): NodeVisitor<MapASTNode> {
    if (this.log?.enabled === true) {
      let loc = ''
      if (node.location !== undefined) {
        loc = `@${node.location.start.line}:${node.location.start.column}`
      }
      this.log?.(
        `Visiting ${node.kind}(${childIdentifier})${loc} <<`,
        { stack, childIdentifier}
      );
    }
    
    switch (node.kind) {
      case 'MapDefinition':
        return new MapDefinitionVisitor(node, stack, childIdentifier, this.log)
      
      case 'OperationDefinition':
        return new OperationDefinitionVisitor(node, stack, childIdentifier, this.log)
      
      case 'SetStatement':
        return new SetStatementVisitor(node, stack, childIdentifier, this.log)
      
      case 'ConditionAtom':
        return new ConditionAtomVisitor(node, stack, childIdentifier, this.log)
      
      case 'IterationAtom':
        return new IterationAtomVisitor(node, stack, childIdentifier, this.log)
      
      case 'Assignment':
        return new AssignmentVisitor(node, stack, childIdentifier, this.log)

      case 'PrimitiveLiteral':
        return new PrimitiveLiteralVisitor(node, stack, childIdentifier, this.log)
      
      case 'ObjectLiteral':
        return new ObjectLiteralVisitor(node, stack, childIdentifier, this.log)

      case 'JessieExpression':
        return new JessieExpressionVisitor(node, stack, childIdentifier, this.log, this.config, this.logger, this.parameters.input, this.parameters.parameters)
      
      case 'InlineCall':
        return new CallVisitor(node, stack, childIdentifier, this.log)
      
      case 'CallStatement':
        return new CallVisitor(node, stack, childIdentifier, this.log)
      
      case 'HttpCallStatement':
        return new HttpCallStatementVisitor(node, stack, childIdentifier, this.log, this.http, this.externalHandler, this.parameters.services, this.parameters.parameters, this.parameters.security)

      case 'HttpResponseHandler':
        return new HttpResponseHandlerVisitor(node, stack, childIdentifier, this.log)
      
      case 'OutcomeStatement':
        return new OutcomeStatementVisitor(node, stack, childIdentifier, this.log)

      default:
        throw new UnexpectedError('TODO')
        // assertUnreachable(node);
    }
  }
}

// function assertUnreachable(node: never): never {
//   throw ''
// }