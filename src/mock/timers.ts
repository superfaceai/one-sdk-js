import { ITimeout, ITimers } from '../core';

export class MockTimeout implements ITimeout {
  constructor(public value: number) {}
}

export class MockTimers implements ITimers {
  public current = Date.now();
  public timers: {
    callback: (...args: unknown[]) => unknown;
    timeout: number;
    enabled: boolean;
  }[] = [];

  public setTimeout(
    callback: (...args: unknown[]) => unknown,
    timeout: number
  ): ITimeout {
    this.timers.push({ callback, timeout, enabled: true });

    return new MockTimeout(this.timers.length - 1);
  }

  public clearTimeout(timeout: MockTimeout): void {
    this.timers[timeout.value].enabled = false;
  }

  public async sleep(ms: number): Promise<void> {
    this.current += ms;
  }

  public now(): number {
    return this.current;
  }

  public tick(ms: number): void {
    this.current += ms;
    for (const timer of this.timers) {
      if (timer.enabled) {
        timer.timeout -= ms;
        if (timer.timeout <= 0) {
          timer.callback();
          timer.enabled = false;
        }
      }
    }
  }
}
