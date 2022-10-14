import 'ses';

import { readFileSync } from 'fs';
import vm from 'vm';

import type { IConfig, ILogger } from '../../../interfaces';
import type { NonPrimitive } from '../../../lib';
import { getStdlib } from './stdlib';

const sesLockDownPath = require.resolve('ses/dist/lockdown.umd.js');
const lockdown = readFileSync(sesLockDownPath, { encoding: 'utf8' });

export function evalScript(
  config: IConfig,
  js: string,
  logger?: ILogger,
  variableDefinitions?: NonPrimitive
): unknown {
  const context = vm.createContext({ STD: getStdlib(logger), ...variableDefinitions });
  vm.runInContext(lockdown, context);

  /*
  // SES Compartment
  // can't be used, because can't be controlled timeout
  const comparement = vm.runInContext('new Compartment()', context) as Compartment;
  return comparement.evaluate(js);
  */

  // https://github.com/endojs/endo/blob/master/packages/ses/docs/guide.md#what-lockdown-does-to-javascript
  // https://github.com/endojs/endo/blob/master/packages/ses/docs/guide.md#what-lockdown-removes-from-standard-javascript
  vm.runInContext('lockdown()', context);

  return vm.runInContext(js, context, { timeout: config.sandboxTimeout });
}
