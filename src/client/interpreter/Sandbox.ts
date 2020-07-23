import { VM } from 'vm2';

import { Variables } from '../../internal/interpreter/interfaces';

export const SCRIPT_TIMEOUT = 100;

export function evalScript(
  js: string,
  variableDefinitions?: Variables
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
    delete global.RegExp // Forbidden
    delete global.Function // Can be restored by taking .constructor of any function, but the VM protection kicks in
    // delete global.Object
    delete global.VMError // Useless
    delete global.Proxy // Forbidden
    delete global.Reflect // Forbidden
    delete global.Promise // Forbidden, also VM protection
    delete global.Symbol // Forbidden

    delete global.eval // Forbidden, also VM protects
    delete global.WebAssembly // Forbidden, also VM protects
    delete global.AsyncFunction // Forbidden, also VM protects
    delete global.SharedArrayBuffer // Just in case
    `
  );

  return vm.run(`'use strict';${js}`);
}
