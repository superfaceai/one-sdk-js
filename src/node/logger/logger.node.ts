import createDebug from 'debug';

import type { ILogger, LogFunction } from '../../core';
import { SuperCache } from '../../lib';

export class NodeLogger implements ILogger {
  private cache: SuperCache<LogFunction> = new SuperCache();

  public log(name: string): LogFunction;
  public log(name: string, format: string, ...args: unknown[]): void;
  public log(
    name: string,
    format?: string,
    ...args: unknown[]
  ): void | LogFunction {
    const instance = this.cache.getCached(name, () => {
      const debugLog = createDebug('superface:' + name);
      if (name.endsWith(':sensitive')) {
        debugLog(
          `
WARNING: YOU HAVE ALLOWED LOGGING SENSITIVE INFORMATION.
THIS LOGGING LEVEL DOES NOT PREVENT LEAKING SECRETS AND SHOULD NOT BE USED IF THE LOGS ARE GOING TO BE SHARED.
CONSIDER DISABLING SENSITIVE INFORMATION LOGGING BY APPENDING THE DEBUG ENVIRONMENT VARIABLE WITH ",-*:sensitive".
`
        );
      }

      return debugLog;
    });

    if (format === undefined) {
      return instance;
    }

    instance(format, ...args);
  }
}
