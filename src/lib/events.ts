/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { BoundProfileProvider } from '../client';
import { FetchInstance } from '../internal/interpreter/http/interfaces';

type AnyFunction = (...args: any[]) => any;

type MaybePromise<T> = T | Promise<T>;
type ResolvedPromise<T> = T extends Promise<infer R> ? R : T;

export type InterceptableMetadata = {
  provider?: string;
  profile?: string;
  usecase?: string;
};
export type Interceptable = {
  metadata?: InterceptableMetadata;
};

type EventContextBase = {
  readonly time: Date;
  readonly usecase?: string;
  readonly profile?: string;
  readonly provider?: string;
};
export type BeforeHookResult<Target extends AnyFunction> =
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
    };

export type BeforeHook<
  EventContext extends EventContextBase,
  Target extends AnyFunction
> = (
  context: EventContext,
  args: Parameters<Target>
) => MaybePromise<BeforeHookResult<Target>>;

export type AfterHookResult<Target extends AnyFunction> =
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
    };

export type AfterHook<
  EventContext extends EventContextBase,
  Target extends AnyFunction
> = (
  context: EventContext,
  args: Parameters<Target>,
  result: ReturnType<Target>
) => MaybePromise<AfterHookResult<Target>>;

type EventTypes = {
  perform: [
    InstanceType<typeof BoundProfileProvider>['perform'],
    EventContextBase
  ];
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
  };

// export type EventParams = {
//   'pre-perform': BeforeHook<
//     EventContextBase,
//     InstanceType<typeof UseCase>['perform']
//   >;
//   'post-perform': AfterHook<
//     EventContextBase,
//     InstanceType<typeof UseCase>['perform']
//   >;
//   'pre-fetch': BeforeHook<EventContextBase, FetchInstance['fetch']>;
//   'post-fetch': AfterHook<EventContextBase, FetchInstance['fetch']>;
// };

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

class Events {
  private listeners: EventListeners = {};

  public on<E extends keyof EventParams>(
    event: E,
    options: {
      priority: number;
      filter?: Filter;
    },
    callback: EventParams[E]
  ): this {
    this.listeners[event] = [
      ...(this.listeners[event] ?? []),
      priorityCallbackTuple<E>(options.priority, callback, options.filter),
    ].sort(([priority1], [priority2]) => priority1 - priority2);

    return this;
  }

  public async emit<E extends keyof EventParams>(
    event: E,
    parameters: Parameters<EventParams[E]>
  ): Promise<ResolvedPromise<ReturnType<EventParams[E]>>> {
    const listeners = this.listeners[event];
    const [context] = parameters;
    let subresult = parameters;
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
        subresult = await callback(...parameters);
      }
    }

    return subresult as any;
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
    // Before hook - runs before the function is called and takes and returns its arguments
    let functionArgs = args;
    if (metadata.placement === 'before' || metadata.placement === 'around') {
      const hookResult = await events.emit(`pre-${metadata.eventName}`, [
        {
          time: new Date(),
          profile: this.metadata?.profile,
          usecase: this.metadata?.usecase,
          provider: this.metadata?.provider,
        },
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

    let result = originalFunction.apply(this, functionArgs) as ReturnType<
      EventTypes[E][0]
    >;

    // After hook - runs after the function is called and takes the result
    // May modify it, return different or retry
    if (metadata.placement === 'after' || metadata.placement === 'around') {
      let retry = true;
      while (retry) {
        const hookResult = await events.emit(`post-${metadata.eventName}`, [
          {
            filter: {
              profile: this.metadata?.profile,
              usecase: this.metadata?.usecase,
            },
          },
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
            result = await originalFunction?.apply(this, hookResult.newArgs);
          } else {
            result = await originalFunction?.apply(this, functionArgs);
          }

          continue;
        }

        // This should be unreachable, but let's not do infinite loops in case something goes terribly wrong
        retry = false;
      }
    }

    return result;
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

export function tap(callback: (...args: any) => void) {
  return function <T extends any[]>(...args: T): T {
    callback(...args);

    return args;
  };
}

export const events = new Events();
