import { IEnvironment } from './environment';

export class NodeEnvironment implements IEnvironment {
  getString(key: string): string | undefined {
    return process.env[key]?.trim();
  }

  getNumber(key: string): number | undefined {
    const value = process.env[key]?.trim();

    if (value === undefined) {
      return undefined;
    }

    return Number(value);
  }

  getBoolean(key: string): boolean | undefined {
    const value = process.env[key]?.trim();

    if (value === undefined) {
      return undefined;
    }

    return value.toLowerCase() === 'true' || value === '1';
  }
}
