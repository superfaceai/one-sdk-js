/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */

import type {
  EventFilter,
  IEvents,
  ILogger,
  ITimers,
  LogFunction,
} from '../../interfaces';
import { UnexpectedError } from '../errors';
import type { HttpResponse, IFetch, RequestParameters } from '../interpreter';
import type { UseCase } from '../usecase';
import type { HooksContext } from './failure/event-adapter';
import type { MapInterpreterEventAdapter } from './failure/map-interpreter-adapter';
import type { FailurePolicyReason } from './failure/policy';

const DEBUG_NAMESPACE = 'events';

type AnyFunction = (...args: any[]) => any;
type AsyncFunction = (...args: any[]) => Promise<any>;

type MaybePromise<T> = T | Promise<T>;
type ResolvedPromise<T> = T extends Promise<infer R> ? R : T;

export type InterceptableMetadata = {
  provider?: string;
  profile?: string;
  usecase?: string;
};

export type Interceptable = {
  metadata?: InterceptableMetadata;
  events?: Events;
};

type EventContextBase = {
  readonly time: Date;
  readonly usecase?: string;
  readonly profile?: string;
  readonly provider?: string;
};

export type BeforeHookResult<Target extends AsyncFunction> = MaybePromise<
  | {
    kind: 'continue';
  }
  | {
    kind: 'modify';
    newArgs: Parameters<Target>;
  }
  | {
    kind: 'abort';
    newResult: ReturnType<Target>;
  }
  | void
>;

export type BeforeHook<
  EventContext extends EventContextBase,
  Target extends AsyncFunction
> = (
  context: EventContext,
  args: Parameters<Target>
) => BeforeHookResult<Target>;

export type AfterHookResult<Target extends AsyncFunction> = MaybePromise<
  | {
    kind: 'continue';
  }
  | {
    kind: 'modify';
    newResult: ReturnType<Target>;
  }
  | {
    kind: 'retry';
    newArgs?: Parameters<Target>;
  }
  | void
>;

export type AfterHook<
  EventContext extends EventContextBase,
  Target extends AsyncFunction
> = (
  context: EventContext,
  args: Parameters<Target>,
  result: ReturnType<Target>
) => AfterHookResult<Target>;

export type BindContext = EventContextBase & {
  profile: string;
  usecase: string;
};

export type PerformContext = EventContextBase & {
  profile: string;
  usecase: string;
  provider: string;
};

export type ProviderSwitchContext = EventContextBase & {
  provider: string;
  toProvider?: string;
  profile: string;
  reason: FailurePolicyReason;
};

export type SuccessContext = EventContextBase & {
  profile: string;
  usecase: string;
  provider: string;
};
export type FailureContext = EventContextBase & {
  profile: string;
  usecase: string;
  provider: string;
};

export type AuthenticateContext = EventContextBase & {
  resourceRequest?: RequestParameters;
  previousResponse?: HttpResponse;
};

type VoidEventTypes = {
  failure: FailureContext;
  success: SuccessContext;
  'provider-switch': ProviderSwitchContext;
};

type VoidEventHook<EventContext extends EventContextBase> = (
  context: EventContext
) => void;

type EventTypes = {
  perform: [
    InstanceType<typeof UseCase>['performBoundUsecase'],
    PerformContext
  ];
  fetch: [IFetch['fetch'], EventContextBase];
  'unhandled-http': [
    InstanceType<typeof MapInterpreterEventAdapter>['unhandledHttp'],
    EventContextBase
  ];
  'bind-and-perform': [
    InstanceType<typeof UseCase>['bindAndPerform'],
    BindContext
  ];
};

export type EventParams = {
  [K in keyof EventTypes as `pre-${K}`]: BeforeHook<
    EventTypes[K][1],
    EventTypes[K][0]
  >;
} & {
  [K in keyof EventTypes as `post-${K}`]: AfterHook<
    EventTypes[K][1],
    EventTypes[K][0]
  >;
} & { [K in keyof VoidEventTypes]: VoidEventHook<VoidEventTypes[K]> };

type EventListeners = {
  [E in keyof EventParams]?: PriorityCallbackTuple[];
};
type PriorityCallbackTuple = [number, AnyFunction, EventFilter?];
function priorityCallbackTuple<T extends keyof EventParams>(
  priority: number,
  callback: EventParams[T],
  filter?: EventFilter
): PriorityCallbackTuple {
  return [priority, callback, filter];
}

export class Events implements IEvents<EventParams> {
  public hookContext: HooksContext = {};

  private listeners: EventListeners = {};
  public log: LogFunction | undefined;

  constructor(public timers: ITimers, logger?: ILogger) {
    this.log = logger?.log(DEBUG_NAMESPACE);
  }

  public on<E extends keyof EventParams>(
    event: E,
    options: {
      priority: number;
      filter?: EventFilter;
    },
    callback: EventParams[E]
  ): void {
    this.log?.(
      `Attaching listener for event "${event}" with priority ${options.priority}`
    );

    this.listeners[event] = [
      ...(this.listeners[event] ?? []),
      priorityCallbackTuple<E>(options.priority, callback, options.filter),
    ].sort(([priority1], [priority2]) => priority1 - priority2);
  }

  public async emit<E extends keyof EventParams>(
    event: E,
    parameters: Parameters<EventParams[E]>
  ): Promise<ResolvedPromise<ReturnType<EventParams[E]>>> {
    this.log?.(`Emitting event "${event}"`);

    const listeners = this.listeners[event];
    const [context] = parameters;
    let params = parameters;
    let subresult: any = { kind: 'continue' };
    if (listeners !== undefined && listeners.length > 0) {
      for (let i = 0; i < listeners.length; i++) {
        const [, callback, filter] = listeners[i];
        if (
          filter?.profile !== undefined &&
          filter?.profile !== context.profile
        ) {
          continue;
        }
        if (
          filter?.usecase !== undefined &&
          filter?.usecase !== context.usecase
        ) {
          continue;
        }
        const hookResult = await callback(...params);
        this.log?.(
          `Event "${event}" listener ${i} result: ${(hookResult?.kind ?? 'continue') as string
          }`
        );
        if (hookResult === undefined || hookResult.kind === 'continue') {
          // DO NOTHING YAY!
        } else if (hookResult.kind === 'modify') {
          params = [context, hookResult.newArgs] as any;
          subresult = hookResult;
        } else if (hookResult.kind === 'abort' || hookResult.kind === 'retry') {
          return hookResult;
        }
      }
    }

    return subresult;
  }
}

export type InterceptPlacement = 'before' | 'after' | 'around';
const eventInterceptorMetadataDefaults = {
  placement: 'around' as InterceptPlacement,
};
type EventMetadata<E extends keyof EventTypes> = Partial<
  typeof eventInterceptorMetadataDefaults
> & {
  eventName: E;
};

function replacementFunction<E extends keyof EventTypes>(
  originalFunction: any,
  metadata: EventMetadata<E>
): EventTypes[E][0] {
  return async function (
    this: Interceptable,
    ...args: Parameters<EventTypes[E][0]>
  ) {
    if (this.events?.log?.enabled === true) {
      let metadataString = 'undefined';
      if (this.metadata !== undefined) {
        metadataString = `{ profile: ${this.metadata.profile ?? 'undefined'
          }, provider: ${this.metadata.provider ?? 'undefined'}, usecase: ${this.metadata.usecase ?? 'undefined'
          } }`;
      }

      let eventsString = 'undefined';
      if (this.events !== undefined) {
        eventsString = 'defined';
      }

      this.events?.log?.(
        `Intercepted function for "${metadata.eventName}" (placement: ${metadata.placement ?? ''
        }) with context: { metadata: ${metadataString}, events: ${eventsString} }`
      );
    }

    const events = this.events;
    if (!events) {
      return originalFunction.apply(this, args);
    }

    // Before hook - runs before the function is called and takes and returns its arguments
    let functionArgs = args;
    let retry = true;
    while (retry) {
      let maybeResult: ReturnType<EventTypes[E][0]> | undefined;

      if (metadata.placement === 'before' || metadata.placement === 'around') {
        const hookResult = await events.emit(`pre-${metadata.eventName}`, [
          {
            time: new Date(events.timers.now()),
            profile: this.metadata?.profile,
            usecase: this.metadata?.usecase,
            provider: this.metadata?.provider,
          },
          functionArgs,
        ] as any);

        if (hookResult === undefined || hookResult.kind === 'continue') {
          // DO NOTHING YAY!
        } else if (hookResult.kind === 'modify') {
          functionArgs = hookResult.newArgs as Parameters<EventTypes[E][0]>;
        } else if (hookResult.kind === 'abort') {
          maybeResult = hookResult.newResult as ReturnType<EventTypes[E][0]>;
        }
      }

      if (maybeResult === undefined) {
        maybeResult = originalFunction.apply(this, functionArgs) as ReturnType<
          EventTypes[E][0]
        >;
      }

      let result: Promise<ReturnType<EventTypes[E][0]>>;
      try {
        result = Promise.resolve(await maybeResult) as Promise<
          ReturnType<EventTypes[E][0]>
        >;
      } catch (err) {
        result = Promise.reject(err);
      }

      // After hook - runs after the function is called and takes the result
      // May modify it, return different or retry
      if (metadata.placement === 'after' || metadata.placement === 'around') {
        const hookResult = await events.emit(`post-${metadata.eventName}`, [
          {
            time: new Date(events.timers.now()),
            profile: this.metadata?.profile,
            usecase: this.metadata?.usecase,
            provider: this.metadata?.provider,
          },
          functionArgs as any,
          result,
        ] as any);

        if (hookResult === undefined || hookResult.kind === 'continue') {
          return result;
        }

        if (hookResult.kind === 'modify') {
          return hookResult.newResult;
        }

        if (hookResult.kind === 'retry') {
          if (hookResult.newArgs !== undefined) {
            functionArgs = hookResult.newArgs as any;
          }

          continue;
        }

        // This should be unreachable, but let's not do infinite loops in case something goes terribly wrong
        retry = false;
      }

      return result;
    }
  } as AsyncFunction as EventTypes[E][0];
}

export function eventInterceptor<E extends keyof EventTypes>(
  eventMetadata: EventMetadata<E>
): (
  target: Interceptable,
  propertyKey: string,
  descriptor: TypedPropertyDescriptor<EventTypes[E][0]>
) => PropertyDescriptor {
  return function (
    target: Interceptable,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<EventTypes[E][0]>
  ): PropertyDescriptor {
    const metadata = {
      ...eventInterceptorMetadataDefaults,
      ...eventMetadata,
    };
    target.events?.log?.(
      `Attaching interceptor for event "${metadata.eventName}" (placement: ${metadata.placement}) onto ${target.constructor.name}::${propertyKey}`
    );

    if (descriptor.value === undefined) {
      throw new UnexpectedError(
        'Something went horribly wrong, Godzilla might be involved!'
      );
    }

    const originalFunction = descriptor.value;
    descriptor.value = replacementFunction<E>(originalFunction, metadata);

    return descriptor;
  };
}
