import { IEnvironment } from '../lib/environment';

export class MockEnvironment implements IEnvironment {
  private values: Record<string, string> = {};

  getString(key: string): string | undefined {
    return this.values[key];
  }

  getNumber(key: string): number | undefined {
    const value = this.values[key];

    if (value === undefined) {
      return undefined;
    }

    return Number(value);
  }

  getBoolean(key: string): boolean | undefined {
    const value = this.values[key];

    if (value === undefined) {
      return undefined;
    }

    return value.toLowerCase() === 'true';
  }

  addValue(key: string, value: string | number | boolean): void {
    this.values[key] = value.toString();
  }

  clear(): void {
    this.values = {};
  }
}
