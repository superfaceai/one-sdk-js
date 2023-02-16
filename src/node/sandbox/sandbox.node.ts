import { VM } from 'vm2';

import type { Stdlib } from '../../core/interpreter/sandbox/stdlib';
import type { IConfig, ILogger } from '../../interfaces';
import type { ISandbox } from '../../interfaces/sandbox';
import type { NonPrimitive } from '../../lib';
import { isClassInstance, isNone } from '../../lib';

const DEBUG_NAMESPACE = 'sandbox';

export class NodeSandbox implements ISandbox {
  public evalScript(
    config: IConfig,
    js: string,
    stdlib?: Stdlib,
    logger?: ILogger,
    variableDefinitions?: NonPrimitive
  ): unknown {
    const vm = new VM({
      sandbox: {
        std: stdlib,
        ...variableDefinitions,
      },
      compiler: 'javascript',
      wasm: false,
      eval: false,
      timeout: config.sandboxTimeout,
      fixAsync: true,
    });

    const log = logger?.log(DEBUG_NAMESPACE);

    // Defensively delete global objects
    // These deletions mostly don't protect, but produce "nicer" errors for the user
    vm.run(
      `
      'use strict'

      delete global.require // Forbidden
      delete global.process // Forbidden
      delete global.console // Forbidden/useless

      delete global.setTimeout
      delete global.setInterval
      delete global.setImmediate
      delete global.clearTimeout
      delete global.clearInterval
      delete global.clearImmediate
      // delete global.String
      // delete global.Number
      // delete global.Buffer
      // delete global.Boolean
      // delete global.Array
      // delete global.Date
      // delete global.RegExp // Forbidden - needed for object literals to work, weirdly
      delete global.Function // Can be restored by taking .constructor of any function, but the VM protection kicks in
      // delete global.Object
      delete global.VMError // Useless
      delete global.Proxy // Forbidden
      delete global.Reflect // Forbidden
      // delete global.Promise // Forbidden, also VM protection - BUT needed for object literals to work, weirdly
      delete global.Symbol // Forbidden

      delete global.eval // Forbidden, also VM protects
      delete global.WebAssembly // Forbidden, also VM protects
      delete global.AsyncFunction // Forbidden, also VM protects
      delete global.SharedArrayBuffer // Just in case
      `
    );

    log?.('Evaluating:', js);
    const result = vm.run(
      `
        'use strict';
        const vmResult = ${js}
        ;vmResult`
    ) as unknown;
    const resultVm2Fixed = this.vm2ExtraArrayKeysFixup(result);

    log?.('Result: %O', resultVm2Fixed);

    return resultVm2Fixed;
  }

  private vm2ExtraArrayKeysFixup<T>(value: T): T {
    if (typeof value !== 'object') {
      return value;
    }

    if (isNone(value)) {
      return value;
    }

    if (
      Buffer.isBuffer(value) ||
      value instanceof ArrayBuffer ||
      isClassInstance(value) ||
      Symbol.iterator in value ||
      Symbol.asyncIterator in value
    ) {
      return value;
    }

    if (Array.isArray(value)) {
      const newArray: unknown[] = [];
      for (let i = 0; i < value.length; i += 1) {
        newArray[i] = this.vm2ExtraArrayKeysFixup(value[i]);
      }

      return newArray as unknown as T;
    }

    const newObject: Record<string, unknown> = {};
    const currentObject = value as Record<string, unknown>;
    for (const key of Object.keys(value)) {
      newObject[key] = this.vm2ExtraArrayKeysFixup(currentObject[key]);
    }

    return newObject as T;
  }
}
