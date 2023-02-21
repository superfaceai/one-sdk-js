export function ensureErrorSubclass(error: unknown): Error {
  if (typeof error === 'string') {
    return new Error(error);
  } else if (error instanceof Error) {
    return error;
  }

  return new Error(JSON.stringify(error));
}

export abstract class ErrorBase extends Error {
  constructor(kind: string, message: string) {
    super(message);
    this.name = kind;
  }

  public get [Symbol.toStringTag](): string {
    return this.name;
  }

  public get kind(): string {
    return this.name;
  }

  public override toString(): string {
    return `${this.name}: ${this.message}`;
  }
}

export class UnexpectedError extends ErrorBase {
  constructor(message: string, public additionalContext?: unknown) {
    super(UnexpectedError.name, message);
  }
}

/**
 * This is a base class for errors that the SDK may throw during normal execution.
 *
 * These errors should be as descriptive as possible to explain the problem to the user.
 */
export class SDKExecutionError extends ErrorBase {
  constructor(
    private shortMessage: string,
    private longLines: string[],
    private hints: string[]
  ) {
    super(SDKExecutionError.name, shortMessage);
    this.message = this.formatLong();
  }

  /**
   * Formats this error into a one-line string
   */
  public formatShort(): string {
    return this.shortMessage;
  }

  /**
   * Formats this error into a possible multi-line string with more context, details and hints
   */
  public formatLong(): string {
    let result = this.shortMessage;

    if (this.longLines.length > 0) {
      result += '\n';
      for (const line of this.longLines) {
        result += '\n' + line;
      }
    }

    if (this.hints.length > 0) {
      result += '\n';
      for (const hint of this.hints) {
        result += '\nHint: ' + hint;
      }
    }

    return result + '\n';
  }

  public override toString(): string {
    return this.formatLong();
  }
}

export class SDKBindError extends SDKExecutionError {
  constructor(shortMessage: string, longLines: string[], hints: string[]) {
    super(shortMessage, longLines, hints);
    this.name = SDKBindError.name;
  }
}
