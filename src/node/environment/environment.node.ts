import { IEnvironment } from '../../core';

export class NodeEnvironment implements IEnvironment {
  public getString(key: string): string | undefined {
    return process.env[key]?.trim();
  }

  public getNumber(key: string): number | undefined {
    const value = process.env[key]?.trim();

    if (value === undefined) {
      return undefined;
    }

    return Number(value);
  }

  public getBoolean(key: string): boolean | undefined {
    const value = process.env[key]?.trim();

    if (value === undefined) {
      return undefined;
    }

    return value.toLowerCase() === 'true' || value === '1';
  }
}
