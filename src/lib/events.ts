/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { UseCase } from '../client';
import { FetchInstance } from '../internal/interpreter/http/interfaces';
import { err, ok, Result } from './result/result';

export type EventParams = {
  'pre-perform': (
    args: Parameters<InstanceType<typeof UseCase>['perform']>
  ) => Parameters<InstanceType<typeof UseCase>['perform']>;
  perform: (
    args: ReturnType<InstanceType<typeof UseCase>['perform']>
  ) => boolean;
  'post-perform': (
    args: ReturnType<InstanceType<typeof UseCase>['perform']>
  ) => ReturnType<InstanceType<typeof UseCase>['perform']>;
  'pre-fetch': (
    args: Parameters<FetchInstance['fetch']>
  ) => Parameters<FetchInstance['fetch']>;
  fetch: (args: ReturnType<FetchInstance['fetch']>) => boolean;
  'post-fetch': (
    args: ReturnType<FetchInstance['fetch']>
  ) => ReturnType<FetchInstance['fetch']>;
};

type EventListeners = {
  [E in keyof EventParams]?: PriorityCallbackTuple[];
};
type Filter = { usecase?: string; profile?: string };
type PriorityCallbackTuple = [number, any, Filter?];
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
    parameters: {
      functionArgs?: Parameters<EventParams[E]>;
      filter?: { usecase?: string; profile?: string };
    }
  ): Promise<Result<Parameters<EventParams[E]>, unknown>> {
    const listeners = this.listeners[event];
    let subresult: any = parameters?.functionArgs ?? [];
    if (listeners !== undefined && listeners.length > 0) {
      for (let i = 0; i < listeners.length; i++) {
        const [, callback, filter] = listeners[i];
        if (
          filter?.profile !== undefined &&
          filter?.profile !== parameters.filter?.profile
        ) {
          continue;
        }
        if (
          filter?.usecase !== undefined &&
          filter?.usecase !== parameters.filter?.usecase
        ) {
          continue;
        }
        try {
          subresult = await callback(...subresult);
        } catch (e) {
          return err(e);
        }
      }
    }

    return ok(subresult);
  }
}

export enum InterceptPlacementFlags {
  None,
  Before = 1 << 1,
  After = 1 << 2,
  On = 1 << 3,
}
function checkPlacement(
  placement: InterceptPlacementFlags,
  type: InterceptPlacementFlags
): boolean {
  return (placement & type) === type;
}
const eventInterceptorMetadataDefaults = {
  placement: InterceptPlacementFlags.Before | InterceptPlacementFlags.After,
};
type EventMetadata = Partial<typeof eventInterceptorMetadataDefaults> & {
  eventName: 'perform' | 'fetch';
};

// We need any here, because void cannot be assigned to unknown for some reason
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AsyncFunction = (...args: any[]) => Promise<any>;

export function eventInterceptor(
  eventMetadata: EventMetadata
): (
  target: unknown,
  propertyKey: string,
  descriptor: TypedPropertyDescriptor<AsyncFunction>
) => PropertyDescriptor {
  return function (
    _target: any,
    _propertyKey: string,
    descriptor: TypedPropertyDescriptor<AsyncFunction>
  ): PropertyDescriptor {
    const metadata = {
      ...eventInterceptorMetadataDefaults,
      ...eventMetadata,
    };

    const originalFunction = descriptor.value;
    descriptor.value = async function (this: unknown, ...args: any[]) {
      const targetMetadata = Reflect.get(this as any, 'metadata') as Record<
        string,
        string
      >;

      // Before hook - runs before the function is called and takes and returns its arguments
      let functionArgs = args;
      if (checkPlacement(metadata.placement, InterceptPlacementFlags.Before)) {
        const hookResult = await events.emit(`pre-${metadata.eventName}`, {
          functionArgs: functionArgs as any,
          filter: {
            profile: targetMetadata?.profile,
            usecase: targetMetadata?.usecase,
          },
        });

        if (hookResult.isErr()) {
          return hookResult;
        }

        functionArgs = hookResult.value;
      }

      // On hook - runs after the function is called and takes the result and returns boolean
      // if false, calls the function again with original arguments
      let result: any;
      if (checkPlacement(metadata.placement, InterceptPlacementFlags.On)) {
        let retry = false;
        do {
          result = await originalFunction?.apply(this, args);
          retry = ((await events.emit(metadata.eventName, {
            functionArgs: result,
          })) as any).value;
        } while (retry === true);
      } else {
        result = await originalFunction?.apply(this, args);
      }

      // After hook - runs after the function is called and takes and returns the result
      if (checkPlacement(metadata.placement, InterceptPlacementFlags.After)) {
        const hookResult = await events.emit(
          `post-${metadata.eventName}`,
          result
        );

        if (hookResult.isErr()) {
          return hookResult;
        }
      }

      return result;
    };

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
