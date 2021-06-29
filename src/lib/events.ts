/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { UseCase } from '../client';
import { FetchInstance } from '../internal/interpreter/http/interfaces';

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
>;

export type AfterHook<
  EventContext extends EventContextBase,
  Target extends AsyncFunction
> = (
  context: EventContext,
  args: Parameters<Target>,
  result: ReturnType<Target>
) => AfterHookResult<Target>;

export type PerformContext = EventContextBase & {
  profile: string;
  provider: string;
};

type VoidEventTypes = {
  failure: EventContextBase;
  success: EventContextBase;
};

type VoidEventHook<EventContext extends EventContextBase> = (
  context: EventContext
) => void;

type EventTypes = {
  perform: [InstanceType<typeof UseCase>['perform'], PerformContext];
  fetch: [FetchInstance['fetch'], EventContextBase];
};

export type EventParams = {
  [K in keyof EventTypes as `pre-${K}`]: BeforeHook<
    EventTypes[K][1],
    EventTypes[K][0]
  >;
} &
  {
    [K in keyof EventTypes as `post-${K}`]: AfterHook<
      EventTypes[K][1],
      EventTypes[K][0]
    >;
  } &
  { [K in keyof VoidEventTypes]: VoidEventHook<VoidEventTypes[K]> };

type EventListeners = {
  [E in keyof EventParams]?: PriorityCallbackTuple[];
};
type Filter = { usecase?: string; profile?: string };
type PriorityCallbackTuple = [number, AnyFunction, Filter?];
function priorityCallbackTuple<T extends keyof EventParams>(
  priority: number,
  callback: EventParams[T],
  filter?: Filter
): PriorityCallbackTuple {
  return [priority, callback, filter];
}

export class Events {
  private listeners: EventListeners = {};

  public on<E extends keyof EventParams>(
    event: E,
    options: {
      priority: number;
      filter?: Filter;
    },
    callback: EventParams[E]
  ): void {
    this.listeners[event] = [
      ...(this.listeners[event] ?? []),
      priorityCallbackTuple<E>(options.priority, callback, options.filter),
    ].sort(([priority1], [priority2]) => priority1 - priority2);
  }

  public async emit<E extends keyof EventParams>(
    event: E,
    parameters: Parameters<EventParams[E]>
  ): Promise<ResolvedPromise<ReturnType<EventParams[E]>>> {
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

        if (hookResult.kind === 'modify') {
          params = [context, hookResult.newArgs] as any;
          subresult = hookResult;
        }

        if (hookResult.kind === 'abort' || hookResult.kind === 'retry') {
          return hookResult;
        }

        if (hookResult.kind === 'continue') {
          // DO NOTHING YAY!
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
    const events = this.events;

    if (!events) {
      return originalFunction.apply(this, args);
    }

    // Before hook - runs before the function is called and takes and returns its arguments
    let functionArgs = args;
    let retry = true;
    const baseContext: EventContextBase = {
      time: new Date(),
      profile: this.metadata?.profile,
      usecase: this.metadata?.usecase,
      provider: this.metadata?.provider,
    };
    while (retry) {
      if (metadata.placement === 'before' || metadata.placement === 'around') {
        const hookResult = await events.emit(`pre-${metadata.eventName}`, [
          baseContext,
          functionArgs,
        ] as any);

        if (hookResult.kind === 'modify') {
          functionArgs = hookResult.newArgs as Parameters<EventTypes[E][0]>;
        }

        if (hookResult.kind === 'abort') {
          return hookResult.newResult;
        }

        if (hookResult.kind === 'continue') {
          // DO NOTHING YAY!
        }
      }

      let result: Promise<ReturnType<EventTypes[E][0]>>;
      try {
        result = Promise.resolve(
          await originalFunction.apply(this, functionArgs)
        );
      } catch (err) {
        result = Promise.reject(err);
      }

      // After hook - runs after the function is called and takes the result
      // May modify it, return different or retry
      if (metadata.placement === 'after' || metadata.placement === 'around') {
        const hookResult = await events.emit(`post-${metadata.eventName}`, [
          baseContext,
          functionArgs as any,
          result,
        ] as any);

        if (hookResult.kind === 'continue') {
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
  } as unknown as EventTypes[E][0];
}

export function eventInterceptor<E extends keyof EventTypes>(
  eventMetadata: EventMetadata<E>
): (
  target: Interceptable,
  propertyKey: string,
  descriptor: TypedPropertyDescriptor<EventTypes[E][0]>
) => PropertyDescriptor {
  return function (
    _target: Interceptable,
    _propertyKey: string,
    descriptor: TypedPropertyDescriptor<EventTypes[E][0]>
  ): PropertyDescriptor {
    const metadata = {
      ...eventInterceptorMetadataDefaults,
      ...eventMetadata,
    };
    if (descriptor.value === undefined) {
      throw new Error(
        'Something went horribly wrong, Godzilla might be involved!'
      );
    }

    const originalFunction = descriptor.value;
    descriptor.value = replacementFunction<E>(originalFunction, metadata);

    return descriptor;
  };
}
