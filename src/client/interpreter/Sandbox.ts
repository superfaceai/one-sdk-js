import { VM } from "vm2";

export class Sandbox {
  evalJS = (js: string): unknown => {
    const vm = new VM({
      sandbox: {},
      wasm: false,
      eval: false,
      timeout: 100,
    });

    return vm.run(`'use strict'; ${js}`);
  };
}
