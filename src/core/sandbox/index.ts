import type { IConfig, ILogger } from '../../interfaces';
import type { ISandbox } from '../../interfaces/sandbox';
import type { NonPrimitive } from '../../lib';
import type { Stdlib } from '../interpreter/sandbox';

/**
 * WARNING:
 *
 * This isn't sandbox at all, this simply evaluates user provided JavaScript code.
 * So smart bad bad user, can do harmful things.
 */
export class PureJSSandbox implements ISandbox {
  public evalScript(
    _config: IConfig,
    js: string,
    stdlib?: Stdlib,
    _logger?: ILogger,
    variableDefinitions?: NonPrimitive
  ): unknown {
    const scope = {
      std: stdlib,
      ...variableDefinitions,
    };

    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const func = new Function(
      ...Object.keys(scope),
      `
        'use strict';
        const vmResult = ${js}
        ; return vmResult;
      `
    );

    return func(...Object.values(scope));
  }
}
