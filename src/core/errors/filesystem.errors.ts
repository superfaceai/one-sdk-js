import { ErrorBase } from '../../lib';

export class FileExistsError extends ErrorBase {
  constructor(message: string) {
    super(FileExistsError.name, message);
    Object.setPrototypeOf(this, FileExistsError.prototype);
  }
}

export class PermissionDeniedError extends ErrorBase {
  constructor(message: string) {
    super(PermissionDeniedError.name, message);
    Object.setPrototypeOf(this, PermissionDeniedError.prototype);
  }
}

export class NotEmptyError extends ErrorBase {
  constructor(message: string) {
    super(NotEmptyError.name, message);
    Object.setPrototypeOf(this, NotEmptyError.prototype);
  }
}

export class NotFoundError extends ErrorBase {
  constructor(message: string) {
    super(NotFoundError.name, message);
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class UnknownFileSystemError extends ErrorBase {
  constructor(message: string) {
    super(UnknownFileSystemError.name, message);
    Object.setPrototypeOf(this, UnknownFileSystemError.prototype);
  }
}

export type FileSystemError =
  | FileExistsError
  | PermissionDeniedError
  | NotEmptyError
  | NotFoundError
  | UnknownFileSystemError;
