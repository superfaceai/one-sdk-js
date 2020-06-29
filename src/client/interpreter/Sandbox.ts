import { VM } from 'vm2';

export class Sandbox {
  evalJS = (
    js: string,
    variableDefinitions?: Record<string, string>
  ): unknown => {
    const vm = new VM({
      sandbox: {},
      wasm: false,
      eval: false,
      timeout: 100,
    });

    let variables = '';

    if (variableDefinitions) {
      variables = Object.entries(variableDefinitions)
        .map(
          ([key, value]) =>
            `const ${key} = JSON.parse('${JSON.stringify(value)}');`
        )
        .join('');
    }

    return vm.run(`'use strict';${variables}${js}`);
  };
}
