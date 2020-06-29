import { VM } from 'vm2';

export const SCRIPT_TIMEOUT = 100;

export function evalScript(
  js: string,
  variableDefinitions?: Record<string, string>
): unknown {
  const vm = new VM({
    sandbox: {
      ...variableDefinitions,
    },
    compiler: 'javascript',
    wasm: false,
    eval: false,
    timeout: SCRIPT_TIMEOUT,
    fixAsync: true,
  });

  // Defensively delete global objects
  // These deletions mostly don't protect, but produce "nicer" errors for the user
  vm.run(
    `
    'use strict'

    delete globalThis.require // Forbidden
    delete globalThis.process // Forbidden
    delete globalThis.console // Forbidden/useless
    
    delete globalThis.setTimeout
    delete globalThis.setInterval
    delete globalThis.setImmediate
    delete globalThis.clearTimeout
    delete globalThis.clearInterval
    delete globalThis.clearImmediate
    // delete globalThis.String
    // delete globalThis.Number
    // delete globalThis.Buffer
    // delete globalThis.Boolean
    // delete globalThis.Array
    // delete globalThis.Date
    delete globalThis.RegExp // Forbidden
    delete globalThis.Function // Can be restored by taking .constructor of any function, but the VM protection kicks in
    // delete globalThis.Object
    delete globalThis.VMError // Useless
    delete globalThis.Proxy // Forbidden
    delete globalThis.Reflect // Forbidden
    delete globalThis.Promise // Forbidden, also VM protection
    delete globalThis.Symbol // Forbidden

    delete globalThis.eval // Forbidden, also VM protects
    delete globalThis.WebAssembly // Forbidden, also VM protects
    delete globalThis.AsyncFunction // Forbidden, also VM protects
    delete globalThis.SharedArrayBuffer // Just in case
    `
  );

  return vm.run(`'use strict';${js}`);
}
