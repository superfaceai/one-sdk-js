import createDebug from 'debug';

import { deepFreeze } from '../../../lib/object';

const debugLog = createDebug('superface:debug-log');

const STDLIB_UNSTABLE = {
  time: {
    isoDateToUnixTimestamp(iso: string): number {
      return new Date(iso).getTime();
    },
    unixTimestampToIsoDate(unix: number): string {
      return new Date(unix).toISOString();
    },
  },
  debug: {
    log(formatter: unknown, ...args: unknown[]): void {
      return debugLog(formatter, ...args);
    },
  },
};

const STDLIB = deepFreeze({
  unstable: STDLIB_UNSTABLE,
});

export function getStdlib(): typeof STDLIB {
  // TODO: This should later decide whether to return debug functions or just their stubs
  return STDLIB;
}
