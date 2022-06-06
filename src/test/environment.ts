import { IEnvironment } from '../lib/environment';

export class MockEnvironment implements IEnvironment {
  private values: Record<string, string> = {};

  public getString(key: string): string | undefined {
    return this.values[key];
  }

  public getNumber(key: string): number | undefined {
    const value = this.values[key];

    if (value === undefined) {
      return undefined;
    }

    return Number(value);
  }

  public getBoolean(key: string): boolean | undefined {
    const value = this.values[key];

    if (value === undefined) {
      return undefined;
    }

    return value.toLowerCase() === 'true';
  }

  public addValue(key: string, value: string | number | boolean): void {
    this.values[key] = value.toString();
  }

  public clear(): void {
    this.values = {};
  }
}
