export class ErrorBase {
  constructor(public kind: string, public message: string) {}

  get [Symbol.toStringTag](): string {
    return this.kind;
  }

  toString(): string {
    return `${this.kind}: ${this.message}`;
  }
}

export class UnexpectedError extends ErrorBase {
  constructor(
    public override message: string,
    public additionalContext?: unknown
  ) {
    super('UnexpectedError', message);
  }
}

/**
 * This is a base class for errors that the SDK may throw during normal execution.
 *
 * These errors should be as descriptive as possible to explain the problem to the user.
 */
export class SDKExecutionError extends Error {
  constructor(
    private shortMessage: string,
    private longLines: string[],
    private hints: string[]
  ) {
    super(shortMessage);
    this.name = 'SdkExecutionError';

    // https://github.com/Microsoft/TypeScript/wiki/Breaking-Changes#extending-built-ins-like-error-array-and-map-may-no-longer-work
    Object.setPrototypeOf(this, SDKExecutionError.prototype);

    this.message = this.formatLong();
  }

  /**
   * Formats this error into a one-line string
   */
  formatShort(): string {
    return this.shortMessage;
  }

  /**
   * Formats this error into a possible multi-line string with more context, details and hints
   */
  formatLong(): string {
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

  get [Symbol.toStringTag](): string {
    return this.name;
  }

  override toString(): string {
    return this.formatLong();
  }
}

export class SDKBindError extends SDKExecutionError {
  constructor(shortMessage: string, longLines: string[], hints: string[]) {
    super(shortMessage, longLines, hints);

    // https://github.com/Microsoft/TypeScript/wiki/Breaking-Changes#extending-built-ins-like-error-array-and-map-may-no-longer-work
    Object.setPrototypeOf(this, SDKBindError.prototype);

    this.name = 'SDKBindError';
  }
}
