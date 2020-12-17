export class ErrorBase {
  constructor(public kind: string, public message: string) {}
}

export class UnexpectedError extends ErrorBase {
  constructor(public message: string, public additionalContext?: unknown) {
    super('UnexpectedError', message);
  }
}
