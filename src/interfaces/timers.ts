export interface ITimeout {
  value: unknown;
}

export interface ITimers {
  setTimeout(
    callback: (...args: unknown[]) => unknown,
    timeout: number
  ): ITimeout;
  clearTimeout(timeout: ITimeout): void;
  sleep(ms: number): Promise<void>;
  now(): number;
}
