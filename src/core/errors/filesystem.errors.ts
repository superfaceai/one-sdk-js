export class FileExistsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, FileExistsError.prototype);
  }
}

export class PermissionDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, PermissionDeniedError.prototype);
  }
}

export class NotEmptyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, NotEmptyError.prototype);
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class UnknownFileSystemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, UnknownFileSystemError.prototype);
  }
}

export type FileSystemError =
  | FileExistsError
  | PermissionDeniedError
  | NotEmptyError
  | NotFoundError
  | UnknownFileSystemError;
