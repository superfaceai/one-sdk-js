export type LogFunction = {
  (format: string, ...args: unknown[]): void;
  enabled: boolean;
};

export interface ILogger {
  log(name: string): LogFunction;
  log(name: string, format: string, ...args: unknown[]): void;
}
