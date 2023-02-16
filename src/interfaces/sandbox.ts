import type { Stdlib } from '../core/interpreter/sandbox/stdlib';
import type { NonPrimitive } from '../lib';
import type { IConfig } from './config';
import type { ILogger } from './logger';

export interface ISandbox {
  evalScript(
    config: IConfig,
    js: string,
    stdlib?: Stdlib,
    logger?: ILogger,
    variableDefinitions?: NonPrimitive
  ): unknown;
}
