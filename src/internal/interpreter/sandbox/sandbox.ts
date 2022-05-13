import createDebug from 'debug';
import { VM } from 'vm2';

import { Config } from '../../../config';
import { NonPrimitive } from '../../../internal/interpreter/variables';
import { getStdlib } from './stdlib';

const debug = createDebug('superface:sandbox');

function vm2ExtraArrayKeysFixup<T>(value: T): T {
  if (typeof value !== 'object') {
    return value;
  }

  if (Buffer.isBuffer(value)) {
    return value;
  }
  
  if (Array.isArray(value)) {
    const newArray: unknown[] = [];
    for (let i = 0; i < value.length; i += 1) {
      newArray[i] = vm2ExtraArrayKeysFixup(value[i]);
    }

    return newArray as unknown as T;
  }

  const newObject: Record<string, unknown> = {};
  const currentObject = value as Record<string, unknown>;
  for (const key of Object.keys(value)) {
    newObject[key] = vm2ExtraArrayKeysFixup(currentObject[key]);
  }

  return newObject as T;
}

export function evalScript(
  js: string,
  variableDefinitions?: NonPrimitive
): unknown {
  const vm = new VM({
    sandbox: {
      std: getStdlib(),
      ...variableDefinitions,
    },
    compiler: 'javascript',
    wasm: false,
    eval: false,
    timeout: Config.instance().sandboxTimeout,
    fixAsync: true,
  });

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

  debug('Evaluating:', js);
  const result = vm.run(
    `'use strict';const vmResult = ${js};vmResult`
  ) as unknown;

  if (debug.enabled) {
    debug('Result:', vm2ExtraArrayKeysFixup(result));
  }

  return result;
}
