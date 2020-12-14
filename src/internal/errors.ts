export class ErrorBase {
  constructor(public kind: string, public message: string) {}
}

export class UnexpectedError extends ErrorBase {
  constructor(public message: string) {
    super('UnexpectedError', message);
  }
}
