import type { ITimeout, ITimers } from '../../core';

export class NodeTimeout implements ITimeout {
  constructor(public value: NodeJS.Timeout) {}
}

export class NodeTimers implements ITimers {
  public setTimeout(
    callback: (...args: unknown[]) => unknown,
    timeout: number
  ): ITimeout {
    return new NodeTimeout(setTimeout(callback, timeout));
  }

  public clearTimeout(timeout: NodeTimeout): void {
    clearTimeout(timeout.value);
  }

  public async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public now(): number {
    return Date.now();
  }
}
