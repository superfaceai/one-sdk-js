import type { ILogger, LogFunction } from '../../../interfaces';
import { deepFreeze } from '../../../lib';

const DEBUG_NAMESPACE = 'debug-log';

const STDLIB_UNSTABLE = (debugLog?: LogFunction) => ({
  time: {
    isoDateToUnixTimestamp(iso: string): number {
      return new Date(iso).getTime();
    },
    unixTimestampToIsoDate(unix: number): string {
      return new Date(unix).toISOString();
    },
  },
  debug: {
    log(formatter: string, ...args: unknown[]): void {
      return debugLog?.(formatter, ...args);
    },
  },
});

const STDLIB = (debugLog?: LogFunction) =>
  deepFreeze({
    unstable: STDLIB_UNSTABLE(debugLog),
  });

export function getStdlib(logger?: ILogger): ReturnType<typeof STDLIB> {
  const debugLog = logger?.log(DEBUG_NAMESPACE);

  // TODO: This should later decide whether to return debug functions or just their stubs
  return STDLIB(debugLog);
}
