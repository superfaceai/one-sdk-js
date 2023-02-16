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
  MapASTNode,
  MapDefinitionNode,
  MapDocumentNode,
  ObjectLiteralNode,
  OperationDefinitionNode,
  OutcomeStatementNode,
  PrimitiveLiteralNode,
  SetStatementNode,
} from '@superfaceai/ast';
import {
  isMapDefinitionNode,
  isMapDocumentNode,
  isOperationDefinitionNode,
} from '@superfaceai/ast';

import type {
  IConfig,
  ICrypto,
  ILogger,
  LogFunction,
  MapInterpreterError,
} from '../../interfaces';
import {
  isBinaryData,
  isDestructible,
  isInitializable,
} from '../../interfaces';
import type { ISandbox } from '../../interfaces/sandbox';
import type { NonPrimitive, Result, Variables } from '../../lib';
import {
  assertIsVariables,
  castToVariables,
  err,
  fromEntriesOptional,
  isNone,
  isNonPrimitive,
  isPrimitive,
  mergeVariables,
  ok,
  SDKExecutionError,
  UnexpectedError,
} from '../../lib';
import type { IServiceSelector } from '../services';
import type { MapInterpreterExternalHandler } from './external-handler';
import type { AuthCache, SecurityConfiguration } from './http';
import { HttpClient } from './http';
import type { IFetch } from './http/interfaces';
import {
  HTTPError,
  JessieError,
  MapASTError,
  MappedError,
  MappedHTTPError,
} from './map-interpreter.errors';
import { getStdlib } from './sandbox/stdlib';

function assertUnreachable(_: never): never {
  throw 'unreachable';
}

const DEBUG_NAMESPACE = 'map-interpreter';

export interface MapParameters<
  TInput extends NonPrimitive | undefined = undefined
> {
  usecase?: string;
  input?: TInput;
  parameters?: Record<string, string>;
  services: IServiceSelector;
  security: SecurityConfiguration[];
}

type PerformResult = Result<
  Variables | undefined,
  MapInterpreterError | UnexpectedError | SDKExecutionError
>;

type VisitorOutcomeValueSuccess = { data: Variables | undefined };
type VisitorOutcomeValueError = {
  error: Variables;
  /** Outcome node which produced this error outcome. */
  sourceNode: OutcomeStatementNode;
  /** Stack value at the moment when the node was invoked. */
  stack: NonPrimitive;
  /** Whether the outcome came from a node which is a descendant of an http call.
   *
   * This exists to support original behavior.
   */
  fromHttp: boolean;
};
type VisitorOutcomeValue =
  | VisitorOutcomeValueSuccess
  | VisitorOutcomeValueError;

/** Another node to explore in depth-first fashion. */
type VisitorResultExplore = {
  kind: 'explore';
  /** What (node or operation name) to explore next (depth-first). */
  what: { node: MapASTNode } | { operation: string };
  /** Initial variable stack passed to the child. */
  stack: NonPrimitive;
  /** Identifier assigned to the child by the parent - TODO: for debugging for now. */
  childIdentifier: string;
};
/** Final result of this visitor - this visitor is done. */
type VisitorResultDone<V = unknown> = {
  kind: 'done';
  /** Updated variable stack value. */
  stack: NonPrimitive;
  /** Identifier assigned to the child by its parent. */
  childIdentifier: string;
  /** The return value to be given to the parent node. */
  value?: V;
  /** The outcome passed to nearest Map/Operation ancestor. */
  outcome?: { terminate: boolean; value: VisitorOutcomeValue };
};
/** An unrecoverable error that should immediately terminate the exploration and return. */
type VisitorResultError = {
  kind: 'error';
  error: MapInterpreterError | UnexpectedError | SDKExecutionError;
};
/** Yield result of this visitor - the current map/operation should yield a value but this visitor is not done. */
type VisitorResultYield = {
  kind: 'yield';
  /** The value to yield up to the nearest Map/Operation. */
  value: { kind: 'outcome' } & VisitorOutcomeValue;
};

type VisitorGenerator<V = undefined> = AsyncGenerator<
  VisitorResultExplore | VisitorResultYield,
  VisitorResultDone<V> | VisitorResultError,
  VisitorResultDone
>;
type VisitorIteratorResult<V> = IteratorResult<
  VisitorResultExplore | VisitorResultYield,
  VisitorResultDone<V> | VisitorResultError
>;
abstract class NodeVisitor<N extends MapASTNode, V = undefined>
  implements VisitorGenerator<V>
{
  protected static mergeOutcome(
    current: VisitorOutcomeValue | undefined,
    other: VisitorOutcomeValue
  ): VisitorOutcomeValue {
    if ('error' in other) {
      return other;
    } else if (current !== undefined && 'error' in current) {
      return current;
    } else {
      return { data: other.data };
    }
  }

  protected outcome: VisitorOutcomeValue | undefined = undefined;
  constructor(
    public readonly node: N,
    protected stack: NonPrimitive,
    protected readonly childIdentifier: string,
    protected readonly log: LogFunction | undefined
  ) {}

  protected prepareResultDone(
    value?: V,
    terminate?: boolean
  ): VisitorResultDone<V> | VisitorResultError {
    let outcome = undefined;
    if (this.outcome !== undefined) {
      outcome = { terminate: terminate ?? false, value: this.outcome };
    } else if (terminate !== undefined) {
      return {
        kind: 'error',
        error: new UnexpectedError('Expected outcome to be set'),
      };
    }

    return {
      kind: 'done',
      stack: this.stack,
      childIdentifier: this.childIdentifier,
      value,
      outcome,
    };
  }

  protected prepareResultErrorUnexpected(
    message: string,
    context: Record<string, unknown>
  ): VisitorResultError {
    return {
      kind: 'error',
      error: new UnexpectedError(message, {
        ...context,
        node: this.node,
        ast: undefined,
      }),
    };
  }

  /**
   * Processes VisitorResultDone from the child.
   *
   * This includes updating the stack and merging the outcome.
   *
   * Returns whether `outcome.terminate` was true.
   */
  protected processChildResult(result: VisitorResultDone<unknown>): {
    terminate: boolean;
  } {
    this.stack = result.stack;

    if (result.outcome !== undefined) {
      this.log?.('Merging outcome:', this.outcome, 'with', result.outcome);
      this.outcome = NodeVisitor.mergeOutcome(
        this.outcome,
        result.outcome.value
      );

      if (result.outcome.terminate) {
        return { terminate: true };
      }
    }

    return { terminate: false };
  }

  // Helps implementors use the generator syntax.
  protected abstract visit(): VisitorGenerator<V>;

  // TODO: signature unsure, resolve later
  // abstract childYield(result: VisitorResultYield): undefined | VisitorResultYield

  private visitGenerator?: VisitorGenerator<V> = undefined;
  private expectedChildIdentifier?: string = undefined;
  public async next(
    ...args: [] | [VisitorResultDone]
  ): Promise<VisitorIteratorResult<V>> {
    if (this.visitGenerator === undefined) {
      this.visitGenerator = this.visit();
    }

    // here we check child identifier as a sanity check - this helps to ensure that we don't receive a child result
    // that we didn't previously request using `explore` result
    const actualChildIdentifier = args[0]?.childIdentifier;
    if (this.expectedChildIdentifier !== actualChildIdentifier) {
      const expected = this.expectedChildIdentifier?.toString() ?? 'undefined';
      const actual = actualChildIdentifier?.toString() ?? 'undefined';

      return {
        done: true,
        value: {
          kind: 'error',
          error: new UnexpectedError(
            `Sanity check failed in ${this.toString()}: Expected child identifier ${expected} but found ${actual}`
          ),
        },
      };
    }

    const result = await this.visitGenerator.next(...args);

    // store last childIdentifier
    if (result.value.kind === 'explore') {
      this.expectedChildIdentifier = result.value.childIdentifier;
    } else {
      this.expectedChildIdentifier = undefined;
    }

    return result;
  }

  public return(
    _value:
      | VisitorResultDone
      | VisitorResultError
      | PromiseLike<VisitorResultDone | VisitorResultError>
  ): Promise<VisitorIteratorResult<V>> {
    throw new Error('Method not implemented.');
  }

  public throw(_e: unknown): Promise<VisitorIteratorResult<V>> {
    throw new Error('Method not implemented.');
  }

  public [Symbol.asyncIterator](): VisitorGenerator<V> {
    return this;
  }

  public abstract [Symbol.toStringTag](): string;

  public toString(): string {
    return `${this[Symbol.toStringTag]()}(${this.childIdentifier})`;
  }
}

class MapDefinitionVisitor extends NodeVisitor<MapDefinitionNode> {
  public override async *visit(): VisitorGenerator<undefined> {
    for (let i = 0; i < this.node.statements.length; i += 1) {
      const result = yield {
        kind: 'explore',
        what: { node: this.node.statements[i] },
        stack: this.stack,
        childIdentifier: `${this.childIdentifier}.statements[${i}]`,
      };

      if (this.processChildResult(result).terminate) {
        return this.prepareResultDone(undefined, true);
      }
    }

    return this.prepareResultDone(undefined);
  }

  public override [Symbol.toStringTag](): string {
    return 'MapDefinitionVisitor';
  }
}

class OperationDefinitionVisitor extends NodeVisitor<OperationDefinitionNode> {
  public override async *visit(): VisitorGenerator {
    for (let i = 0; i < this.node.statements.length; i += 1) {
      const result = yield {
        kind: 'explore',
        what: { node: this.node.statements[i] },
        stack: this.stack,
        childIdentifier: `${this.childIdentifier}.statements[${i}]`,
      };

      if (this.processChildResult(result).terminate) {
        return this.prepareResultDone(undefined, true);
      }
    }

    return this.prepareResultDone(undefined);
  }

  public override [Symbol.toStringTag](): string {
    return 'OperationDefinitionVisitor';
  }
}

class SetStatementVisitor extends NodeVisitor<SetStatementNode> {
  public override async *visit(): VisitorGenerator {
    if (this.node.condition !== undefined) {
      const result = yield {
        kind: 'explore',
        what: { node: this.node.condition },
        stack: this.stack,
        childIdentifier: `${this.childIdentifier}.condition`,
      };

      // TODO: assert is boolean?
      if (result.value === false) {
        return this.prepareResultDone(undefined);
      }
    }

    for (let i = 0; i < this.node.assignments.length; i += 1) {
      const result = yield {
        kind: 'explore',
        what: { node: this.node.assignments[i] },
        stack: this.stack,
        childIdentifier: `${this.childIdentifier}.assignments[${i}]`,
      };

      if (result.value === undefined) {
        return {
          kind: 'error',
          error: new UnexpectedError(
            'Assignment child returned invalid result',
            { value: result.value, node: this.node }
          ),
        };
      }
      this.log?.('Updating stack with:', result.value);

      // TODO: this is different from before - it allows consecutive assignments to see values from previous ones
      // TODO: assert result.value is NonPrimitive
      this.stack = mergeVariables(this.stack, result.value as NonPrimitive);
    }

    return this.prepareResultDone(undefined);
  }

  public override [Symbol.toStringTag](): string {
    return 'SetStatementVisitor';
  }
}

class ConditionAtomVisitor extends NodeVisitor<ConditionAtomNode, boolean> {
  public override async *visit(): VisitorGenerator<boolean> {
    const result = yield {
      kind: 'explore',
      what: { node: this.node.expression },
      stack: this.stack,
      childIdentifier: `${this.childIdentifier}.value`,
    };

    return this.prepareResultDone(Boolean(result.value));
  }

  public override [Symbol.toStringTag](): string {
    return 'ConditionAtomVisitor';
  }
}

class AssignmentVisitor extends NodeVisitor<AssignmentNode, NonPrimitive> {
  private static constructObject(
    keys: string[],
    value: Variables
  ): NonPrimitive {
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

  public override async *visit(): VisitorGenerator<NonPrimitive> {
    const result = yield {
      kind: 'explore',
      what: { node: this.node.value },
      stack: this.stack,
      childIdentifier: `${this.childIdentifier}.value`,
    };

    // TODO: assert result.value is Variables
    const object = AssignmentVisitor.constructObject(
      this.node.key,
      result.value as Variables
    );

    return this.prepareResultDone(object);
  }

  public override [Symbol.toStringTag](): string {
    return 'AssignmentVisitor';
  }
}

class PrimitiveLiteralVisitor extends NodeVisitor<
  PrimitiveLiteralNode,
  string | number | boolean
> {
  // eslint-disable-next-line require-yield
  public override async *visit(): VisitorGenerator<string | number | boolean> {
    return this.prepareResultDone(this.node.value);
  }

  public override [Symbol.toStringTag](): string {
    return 'PrimitiveLiteralVisitor';
  }
}

class ObjectLiteralVisitor extends NodeVisitor<
  ObjectLiteralNode,
  NonPrimitive
> {
  public override async *visit(): VisitorGenerator<NonPrimitive> {
    let object: NonPrimitive = {};

    for (let i = 0; i < this.node.fields.length; i += 1) {
      const result = yield {
        kind: 'explore',
        what: { node: this.node.fields[i] },
        stack: this.stack,
        childIdentifier: `${this.childIdentifier}.fields[${i}]`,
      };

      // TODO: typecheck
      object = mergeVariables(object, result.value as NonPrimitive);
    }

    return this.prepareResultDone(object);
  }

  public override [Symbol.toStringTag](): string {
    return 'ObjectLiteralVisitor';
  }
}

class JessieExpressionVisitor extends NodeVisitor<
  JessieExpressionNode,
  Variables | undefined
> {
  constructor(
    node: JessieExpressionNode,
    stack: NonPrimitive,
    childIdentifier: string,
    log: LogFunction | undefined,
    private readonly sandbox: ISandbox,
    private readonly config: IConfig,
    private readonly logger: ILogger | undefined,
    private readonly inputParameters: NonPrimitive | undefined,
    private readonly integrationParameters: Record<string, string> | undefined
  ) {
    super(node, stack, childIdentifier, log);
  }

  // eslint-disable-next-line require-yield
  public override async *visit(): VisitorGenerator<Variables | undefined> {
    try {
      // this await resolves Promises coming out of jessie such as BinaryData.peek etc.
      const result = await this.sandbox.evalScript(
        this.config,
        this.node.expression,
        getStdlib(this.logger),
        this.logger,
        {
          ...this.stack,
          ...fromEntriesOptional(
            ['input', this.inputParameters],
            ['parameters', this.integrationParameters]
          ),
        }
      );

      return this.prepareResultDone(castToVariables(result));
    } catch (e) {
      return {
        kind: 'error',
        error: new JessieError('Error in Jessie script', e as Error, {
          node: this.node,
        }),
      };
    }
  }

  public override [Symbol.toStringTag](): string {
    return 'JessieExpressionVisitor';
  }
}

class IterationAtomVisitor extends NodeVisitor<
  IterationAtomNode,
  Iterable<Variables>
> {
  private static isIterable(input: unknown): input is Iterable<Variables> {
    return (
      typeof input === 'object' &&
      input !== null &&
      (Symbol.iterator in input || Symbol.asyncIterator in input)
    );
  }

  public override async *visit(): VisitorGenerator<Iterable<Variables>> {
    const result = yield {
      kind: 'explore',
      what: { node: this.node.iterable },
      stack: this.stack,
      childIdentifier: `${this.childIdentifier}.value`,
    };

    if (!IterationAtomVisitor.isIterable(result.value)) {
      return {
        kind: 'error',
        error: new MapASTError(
          `Result of expression: ${this.node.iterable.expression} is not iterable.`,
          { node: this.node }
        ),
      };
    }

    return this.prepareResultDone(result.value);
  }

  public override [Symbol.toStringTag](): string {
    return 'IterationAtomVisitor';
  }
}

class CallVisitor extends NodeVisitor<
  InlineCallNode | CallStatementNode,
  Variables | undefined
> {
  public override async *visit(): VisitorGenerator<Variables | undefined> {
    // generalized case for iterated and non-iterated call
    let iterable: Iterable<Variables> = [0];
    let iterationVariable: string | undefined = undefined;
    if (this.node.iteration !== undefined) {
      const result = yield {
        kind: 'explore',
        what: { node: this.node.iteration },
        stack: this.stack,
        childIdentifier: `${this.childIdentifier}.iteration`,
      };

      iterable = result.value as Iterable<Variables>;
      iterationVariable = this.node.iteration.iterationVariable;
    }

    const inlineCallResults = [];

    let iterationCounter = -1;
    for await (const iterVariable of iterable) {
      iterationCounter += 1;
      const childIdentifier = `${this.childIdentifier}.*${iterationCounter}`; // TODO: how to correctly mark repetition?

      if (iterationVariable !== undefined) {
        this.stack[iterationVariable] = iterVariable;
      }

      if (this.node.condition !== undefined) {
        const result = yield {
          kind: 'explore',
          what: { node: this.node.condition },
          stack: this.stack,
          childIdentifier: `${childIdentifier}.condition`,
        };

        // TODO: typecheck
        if (result.value === false) {
          continue;
        }
      }

      this.log?.('Calling operation:', this.node.operationName);
      let args: Variables = {};
      for (let i = 0; i < this.node.arguments.length; i += 1) {
        const result = yield {
          kind: 'explore',
          what: { node: this.node.arguments[i] },
          stack: this.stack,
          childIdentifier: `${childIdentifier}.arguments[${i}]`,
        };

        // TODO: typecheck
        args = mergeVariables(args, result.value as NonPrimitive);
      }

      const result = yield {
        kind: 'explore',
        what: { operation: this.node.operationName },
        stack: { args },
        childIdentifier: `${childIdentifier}.operation`,
      };

      const outcome = result.outcome?.value ?? { data: undefined };
      if (this.node.kind === 'InlineCall') {
        if ('error' in outcome) {
          return {
            kind: 'error',
            error: new MapASTError('Unexpected inline call failure.', {
              node: this.node,
            }),
          };
        }

        inlineCallResults.push(outcome.data);
      } else if (this.node.kind === 'CallStatement') {
        const out = outcome as Record<'data' | 'error', Variables | undefined>;
        this.stack['outcome'] = { data: out.data, error: out.error };

        // process statements
        for (let i = 0; i < this.node.statements.length; i += 1) {
          const result = yield {
            kind: 'explore',
            what: { node: this.node.statements[i] },
            stack: this.stack,
            childIdentifier: `${childIdentifier}.statements[${i}]`,
          };

          if (this.processChildResult(result).terminate) {
            return this.prepareResultDone(undefined, true);
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
        return this.prepareResultDone(inlineCallResults[0]);
      } else {
        return this.prepareResultDone(inlineCallResults);
      }
    } else {
      return this.prepareResultDone(undefined);
    }
  }

  public override [Symbol.toStringTag](): string {
    return 'CallVisitor';
  }
}

type HttpRequest = {
  contentType?: string;
  contentLanguage?: string;
  headers?: NonPrimitive;
  queryParameters?: NonPrimitive;
  body?: Variables;
  security: HttpSecurityRequirement[];
};

class HttpCallStatementVisitor extends NodeVisitor<HttpCallStatementNode> {
  constructor(
    node: HttpCallStatementNode,
    stack: NonPrimitive,
    childIdentifier: string,
    log: LogFunction | undefined,
    private readonly http: HttpClient,
    private readonly externalHandler: MapInterpreterExternalHandler,
    private readonly services: IServiceSelector,
    private readonly inputParameters: NonPrimitive | undefined,
    private readonly integrationParameters: Record<string, string> | undefined,
    private readonly securityConfiguration: SecurityConfiguration[]
  ) {
    super(node, stack, childIdentifier, log);
  }

  public override async *visit(): VisitorGenerator {
    // if node.serviceId is undefined returns the default service, or undefined if no default service is defined
    const serviceUrl = this.services.getUrl(this.node.serviceId);
    if (serviceUrl === undefined) {
      return {
        kind: 'error',
        error: new UnexpectedError(
          'Base url for a service not provided for HTTP call.'
        ),
      };
    }

    let request: HttpRequest | undefined;
    if (this.node.request) {
      const result = yield {
        kind: 'explore',
        what: { node: this.node.request },
        stack: this.stack,
        childIdentifier: `${this.childIdentifier}.request`,
      };

      request = result.value as HttpRequest;
    }

    const accepts = this.node.responseHandlers.map(node => node.contentType);
    let accept: string;
    if (accepts.some(accept => accept === undefined)) {
      accept = '*/*';
    } else {
      accept = accepts
        // deduplicate the array
        .filter((accept, index) => accepts.indexOf(accept) === index)
        .join(', ');
    }

    retry: while (true) {
      this.log?.('Performing http request:', this.node.url);
      let response;
      try {
        response = await this.http.request(this.node.url, {
          method: this.node.method,
          headers: request?.headers,
          contentType: request?.contentType ?? 'application/json',
          accept,
          baseUrl: serviceUrl,
          queryParameters: request?.queryParameters,
          pathParameters: {
            ...this.stack,
            ...fromEntriesOptional(
              ['input', this.inputParameters],
              ['parameters', this.integrationParameters]
            ),
          },
          body: request?.body,
          securityRequirements: request?.security,
          securityConfiguration: this.securityConfiguration,
          integrationParameters: this.integrationParameters,
        });
      } catch (e) {
        if (e instanceof UnexpectedError || e instanceof SDKExecutionError) {
          return { kind: 'error', error: e };
        } else {
          this.log?.('Unhandled exception from http request:', e);
          throw e;
        }
      }

      for (let i = 0; i < this.node.responseHandlers.length; i += 1) {
        this.stack = mergeVariables(this.stack, {
          body: castToVariables(response.body),
          headers: castToVariables(response.headers),
          statusCode: response.statusCode,
        });
        const result = yield {
          kind: 'explore',
          what: { node: this.node.responseHandlers[i] },
          stack: this.stack,
          childIdentifier: `${this.childIdentifier}.response[${i}]`,
        };

        const terminate = this.processChildResult(result).terminate;
        if (this.outcome !== undefined && 'error' in this.outcome) {
          this.outcome.fromHttp = true;
        }
        if (terminate) {
          return this.prepareResultDone(undefined, true);
        }

        // found handler
        if (result.value === true) {
          break retry;
        }
      }

      if (this.externalHandler.unhandledHttp !== undefined) {
        let action;
        try {
          action = await this.externalHandler.unhandledHttp?.(
            undefined, // TODO: can we perform error handling some other way?
            this.node,
            response
          );
        } catch (e: unknown) {
          // TODO: typecheck?
          return { kind: 'error', error: e as UnexpectedError };
        }
        action = action ?? 'continue';
        this.log?.(
          `Processing unhandled response (${response.statusCode}) with external handler:`,
          action
        );

        if (action !== 'retry') {
          break retry;
        }
      } else {
        this.log?.(
          `Processing unhandled response (${response.statusCode}) with built-in handler`
        );

        if (response.statusCode >= 400) {
          return {
            kind: 'error',
            error: new HTTPError(
              'HTTP Error',
              { node: this.node },
              response.statusCode,
              response.debug.request,
              { body: response.body, headers: response.headers }
            ),
          };
        } else {
          break retry;
        }
      }
    }

    return this.prepareResultDone(undefined);
  }

  public override [Symbol.toStringTag](): string {
    return 'HttpCallStatementVisitor';
  }
}

class HttpRequestVisitor extends NodeVisitor<HttpRequestNode, HttpRequest> {
  public override async *visit(): VisitorGenerator<HttpRequest> {
    let headers: undefined | NonPrimitive;
    if (this.node.headers !== undefined) {
      const result = yield {
        kind: 'explore',
        what: { node: this.node.headers },
        stack: this.stack,
        childIdentifier: `${this.childIdentifier}.headers`,
      };

      // TODO: typecheck
      headers = result.value as NonPrimitive;
    }

    let queryParameters: undefined | NonPrimitive;
    if (this.node.query !== undefined) {
      const result = yield {
        kind: 'explore',
        what: { node: this.node.query },
        stack: this.stack,
        childIdentifier: `${this.childIdentifier}.query`,
      };

      // TODO: typecheck
      queryParameters = result.value as NonPrimitive;
    }

    let body: undefined | Variables;
    if (this.node.body !== undefined) {
      const result = yield {
        kind: 'explore',
        what: { node: this.node.body },
        stack: this.stack,
        childIdentifier: `${this.childIdentifier}.body`,
      };

      // TODO: typecheck
      body = result.value as Variables;
    }

    return this.prepareResultDone({
      contentType: this.node.contentType,
      contentLanguage: this.node.contentLanguage,
      headers,
      queryParameters,
      body,
      security: this.node.security,
    });
  }

  public override [Symbol.toStringTag](): string {
    return 'HttpRequestVisitor';
  }
}

class HttpResponseHandlerVisitor extends NodeVisitor<
  HttpResponseHandlerNode,
  boolean
> {
  private matchResponse(): Result<boolean, UnexpectedError> {
    if (
      this.node.statusCode !== undefined &&
      this.node.statusCode !== this.stack.statusCode
    ) {
      return ok(false);
    }

    const headers = this.stack.headers;
    if (headers === undefined || !isNonPrimitive(headers)) {
      return err(
        new UnexpectedError(
          'Stack needs to contain "headers" when visiting HttpResponseHandler'
        )
      );
    }

    const contentType = headers['content-type'];
    if (
      this.node.contentType !== undefined &&
      typeof contentType === 'string' &&
      !contentType.includes(this.node.contentType)
    ) {
      return ok(false);
    }

    const contentLanguage = headers['content-language'];
    if (
      this.node.contentLanguage !== undefined &&
      typeof contentLanguage === 'string' &&
      !contentLanguage.includes(this.node.contentLanguage)
    ) {
      return ok(false);
    }

    return ok(true);
  }

  public override async *visit(): VisitorGenerator<boolean> {
    const matched = this.matchResponse();
    if (matched.isErr()) {
      return { kind: 'error', error: matched.error };
    }
    if (!matched.value) {
      return this.prepareResultDone(false);
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
        childIdentifier: `${this.childIdentifier}.statements[${i}]`,
      };

      if (this.processChildResult(result).terminate) {
        return this.prepareResultDone(undefined, true);
      }
    }

    return this.prepareResultDone(true);
  }

  public override [Symbol.toStringTag](): string {
    return 'HttpResponseHandlerVisitor';
  }
}

class OutcomeStatementVisitor extends NodeVisitor<OutcomeStatementNode> {
  public override async *visit(): VisitorGenerator {
    if (this.node.condition !== undefined) {
      const result = yield {
        kind: 'explore',
        what: { node: this.node.condition },
        stack: this.stack,
        childIdentifier: `${this.childIdentifier}.condition`,
      };

      // TODO: assert is boolean?
      if (result.value === false) {
        return this.prepareResultDone(undefined);
      }
    }

    const result = yield {
      kind: 'explore',
      what: { node: this.node.value },
      stack: this.stack,
      childIdentifier: `${this.childIdentifier}.value`,
    };
    try {
      assertIsVariables(result.value);
    } catch (e: unknown) {
      return { kind: 'error', error: e as UnexpectedError };
    }

    if (this.node.isError) {
      if (result.value === undefined) {
        return {
          kind: 'error',
          error: new UnexpectedError('Outcome error value is undefined'),
        };
      }

      // TODO: deepcopy stack?
      this.outcome = {
        error: result.value,
        fromHttp: false,
        sourceNode: this.node,
        stack: this.stack,
      };
    } else {
      this.outcome = { data: result.value };
    }

    return this.prepareResultDone(undefined, this.node.terminateFlow);
  }

  public override [Symbol.toStringTag](): string {
    return 'OutcomeStatementVisitor';
  }
}

export class MapInterpreter<TInput extends NonPrimitive | undefined> {
  private static async handleFinalOutcome(
    outcome: VisitorOutcomeValue | undefined,
    ast: MapDocumentNode
  ): Promise<PerformResult> {
    outcome = outcome ?? { data: undefined };

    try {
      if ('error' in outcome) {
        outcome.error = await MapInterpreter.resolveOutcomeVariables(
          outcome.error
        );

        return err(MapInterpreter.wrapOutcomeError(outcome, ast));
      } else {
        const data = await MapInterpreter.resolveOutcomeVariables(outcome.data);

        return ok(data);
      }
    } catch (e) {
      // catch promise throws, but this is very hard to work with
      return err(e);
    }
  }

  private static wrapOutcomeError(
    outcome: VisitorOutcomeValueError,
    ast: MapDocumentNode
  ): MapInterpreterError {
    let error: MapInterpreterError;
    if (outcome.fromHttp) {
      let statusCode = undefined;
      if (
        'statusCode' in outcome.stack &&
        typeof outcome.stack.statusCode === 'number'
      ) {
        statusCode = outcome.stack.statusCode;
      }

      error = new MappedHTTPError(
        'Expected HTTP error',
        { node: outcome.sourceNode, ast },
        statusCode,
        outcome.error
      );
    } else {
      error = new MappedError(
        'Expected error',
        { node: outcome.sourceNode, ast },
        outcome.error
      );
    }

    return error;
  }

  private static enrichError(
    error: MapInterpreterError | UnexpectedError | SDKExecutionError,
    ast: MapDocumentNode
  ): MapInterpreterError | UnexpectedError | SDKExecutionError {
    if (error instanceof UnexpectedError) {
      if (
        typeof error.additionalContext === 'object' &&
        error.additionalContext !== null
      ) {
        (error.additionalContext as Record<string, unknown>)['ast'] = ast;
      } else if (error.additionalContext === undefined) {
        error.additionalContext = { ast };
      } else {
        // TODO: we could wrap the original additionalContext or bail?
      }
    } else if (error instanceof SDKExecutionError) {
      // pass
    } else {
      if (error.metadata !== undefined) {
        error.metadata.ast = ast;
      } else {
        error.metadata = { ast };
      }
    }

    return error;
  }

  private static gatherOperations(
    ast: MapDocumentNode
  ): Record<string, OperationDefinitionNode | undefined> {
    return Object.fromEntries(
      ast.definitions.filter(isOperationDefinitionNode).map(op => [op.name, op])
    );
  }

  private static findEntry(
    ast: MapDocumentNode,
    usecaseName: string | undefined
  ): Result<MapDefinitionNode, MapASTError> {
    const entry = ast.definitions
      .filter(isMapDefinitionNode)
      .find(definition => definition.usecaseName === usecaseName);
    if (entry === undefined) {
      return err(
        new MapASTError(`Usecase not found: ${usecaseName ?? 'undefined'}!`, {
          node: ast,
          ast,
        })
      );
    }

    return ok(entry);
  }

  private static async initializeInput(input: NonPrimitive): Promise<void> {
    for (const value of Object.values(input)) {
      if (isInitializable(value)) {
        await value.initialize();
      } else if (isNonPrimitive(value)) {
        await MapInterpreter.initializeInput(value);
      }
    }
  }

  private static async destroyInput(input: NonPrimitive): Promise<void> {
    for (const value of Object.values(input)) {
      if (isDestructible(value)) {
        await value.destroy();
      } else if (isNonPrimitive(value)) {
        await MapInterpreter.destroyInput(value);
      }
    }
  }

  private static async resolveOutcomeVariables(
    input: undefined
  ): Promise<undefined>;
  private static async resolveOutcomeVariables(
    input: Variables
  ): Promise<Variables>;
  private static async resolveOutcomeVariables(
    input: Variables | undefined
  ): Promise<Variables | undefined>;
  private static async resolveOutcomeVariables(
    input: Variables | undefined
  ): Promise<Variables | undefined> {
    if (isBinaryData(input)) {
      throw new UnexpectedError('BinaryData cannot be used as outcome');
    }

    if (isPrimitive(input)) {
      // beware: implicit promise flattening happens here
      return input;
    }

    const result: Variables = {};
    for (const [key, value] of Object.entries(input)) {
      result[key] = await MapInterpreter.resolveOutcomeVariables(value);
    }

    return result;
  }

  private readonly http: HttpClient;
  private readonly externalHandler: MapInterpreterExternalHandler;
  private readonly sandbox: ISandbox;
  private readonly config: IConfig;
  private readonly logger?: ILogger;
  private readonly log: LogFunction | undefined;

  constructor(
    private readonly parameters: MapParameters<TInput>,
    {
      fetchInstance,
      externalHandler,
      sandbox,
      config,
      logger,
      crypto,
    }: {
      fetchInstance: IFetch & AuthCache;
      externalHandler?: MapInterpreterExternalHandler;
      sandbox: ISandbox;
      config: IConfig;
      crypto: ICrypto;
      logger?: ILogger;
    }
  ) {
    this.http = new HttpClient(fetchInstance, crypto, logger);
    this.externalHandler = externalHandler ?? {};
    this.sandbox = sandbox;
    this.config = config;
    this.logger = logger;
    this.log = logger?.log(DEBUG_NAMESPACE);
  }

  public async perform(ast: MapDocumentNode): Promise<PerformResult> {
    const iter = this.performStream(ast);

    const result = await iter.next();
    if (result.done !== true || result.value === undefined) {
      return err(
        new UnexpectedError(
          'Map attempted to yield values but non-streaming perform was invoked'
        )
      );
    }

    return result.value;
  }

  // eslint-disable-next-line require-yield
  private async *performStream(
    ast: MapDocumentNode
  ): AsyncGenerator<unknown, PerformResult, undefined> {
    if (!isMapDocumentNode(ast)) {
      return err(new UnexpectedError('Invalid AST'));
    }

    // setup
    const operations = MapInterpreter.gatherOperations(ast);
    const entryResult = MapInterpreter.findEntry(ast, this.parameters.usecase);
    if (entryResult.isErr()) {
      // oof: it would be nice if Err didn't carry the value type parameter so we could do `return entryResult` here.
      // where is muh Rust when I need it
      return err(entryResult.error);
    }
    const entry = entryResult.value;

    // initialize input
    if (!isNone(this.parameters.input)) {
      await MapInterpreter.initializeInput(this.parameters.input);
    }

    // create a visitor of the root node and put it on the stack
    const nodeStack: NodeVisitor<MapASTNode, unknown>[] = [
      this.createVisitor(entry, {}, 'root'),
    ];

    // drive nodes from the stack until empty
    let lastResult: VisitorResultDone | undefined = undefined;
    while (nodeStack.length > 0) {
      const current = nodeStack[nodeStack.length - 1];

      this.log?.('Stepping', current.toString(), '<<', lastResult);
      let step: VisitorIteratorResult<unknown>;
      if (lastResult !== undefined) {
        step = await current.next(lastResult);
      } else {
        step = await current.next();
      }
      this.log?.(
        step.done === true ? 'Returned' : 'Yielded',
        current.toString(),
        '>>',
        step.value
      );

      lastResult = undefined;
      switch (step.value.kind) {
        case 'explore':
          {
            let node;
            if ('node' in step.value.what) {
              node = step.value.what.node;
            } else {
              node = operations[step.value.what.operation];
              if (node === undefined) {
                return err(
                  new MapASTError(
                    `Operation not found: ${step.value.what.operation}`,
                    { node: current.node, ast }
                  )
                );
              }
            }

            nodeStack.push(
              this.createVisitor(
                node,
                step.value.stack,
                step.value.childIdentifier
              )
            );
          }
          break;

        case 'done':
          nodeStack.pop();
          lastResult = step.value;
          break;

        case 'error':
          return err(MapInterpreter.enrichError(step.value.error, ast));

        case 'yield':
          throw new Error('TODO: not implemented yet');

        default:
          assertUnreachable(step.value);
      }
    }

    const result = await MapInterpreter.handleFinalOutcome(
      lastResult?.outcome?.value,
      ast
    );
    if (result.isOk() && !isNone(this.parameters.input)) {
      await MapInterpreter.destroyInput(this.parameters.input);
    }

    return result;
  }

  private createVisitor(
    node: MapASTNode,
    stack: NonPrimitive,
    childIdentifier: string
  ): NodeVisitor<MapASTNode, unknown> {
    if (this.log?.enabled === true) {
      let loc = '';
      if (node.location !== undefined) {
        loc = `@${node.location.start.line}:${node.location.start.column}`;
      }
      this.log?.(`Visiting ${node.kind}(${childIdentifier})${loc} <<`, {
        stack,
        childIdentifier,
      });
    }

    switch (node.kind) {
      case 'MapDefinition':
        return new MapDefinitionVisitor(node, stack, childIdentifier, this.log);

      case 'OperationDefinition':
        return new OperationDefinitionVisitor(
          node,
          stack,
          childIdentifier,
          this.log
        );

      case 'SetStatement':
        return new SetStatementVisitor(node, stack, childIdentifier, this.log);

      case 'ConditionAtom':
        return new ConditionAtomVisitor(node, stack, childIdentifier, this.log);

      case 'IterationAtom':
        return new IterationAtomVisitor(node, stack, childIdentifier, this.log);

      case 'Assignment':
        return new AssignmentVisitor(node, stack, childIdentifier, this.log);

      case 'PrimitiveLiteral':
        return new PrimitiveLiteralVisitor(
          node,
          stack,
          childIdentifier,
          this.log
        );

      case 'ObjectLiteral':
        return new ObjectLiteralVisitor(node, stack, childIdentifier, this.log);

      case 'JessieExpression':
        return new JessieExpressionVisitor(
          node,
          stack,
          childIdentifier,
          this.log,
          this.sandbox,
          this.config,
          this.logger,
          this.parameters.input,
          this.parameters.parameters
        );

      case 'InlineCall':
        return new CallVisitor(node, stack, childIdentifier, this.log);

      case 'CallStatement':
        return new CallVisitor(node, stack, childIdentifier, this.log);

      case 'HttpCallStatement':
        return new HttpCallStatementVisitor(
          node,
          stack,
          childIdentifier,
          this.log,
          this.http,
          this.externalHandler,
          this.parameters.services,
          this.parameters.input,
          this.parameters.parameters,
          this.parameters.security
        );

      case 'HttpRequest':
        return new HttpRequestVisitor(node, stack, childIdentifier, this.log);

      case 'HttpResponseHandler':
        return new HttpResponseHandlerVisitor(
          node,
          stack,
          childIdentifier,
          this.log
        );

      case 'OutcomeStatement':
        return new OutcomeStatementVisitor(
          node,
          stack,
          childIdentifier,
          this.log
        );

      case 'MapHeader':
        throw new Error('Method not implemented.');

      case 'MapDocument':
        throw new Error('Method not implemented.');

      default:
        assertUnreachable(node);
    }
  }
}
