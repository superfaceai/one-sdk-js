import { ErrorBase } from './errors';

export class FileExistsError extends ErrorBase {
  constructor(message: string) {
    super(FileExistsError.name, message);
  }
}

export class PermissionDeniedError extends ErrorBase {
  constructor(message: string) {
    super(PermissionDeniedError.name, message);
  }
}

export class NotEmptyError extends ErrorBase {
  constructor(message: string) {
    super(NotEmptyError.name, message);
  }
}

export class NotFoundError extends ErrorBase {
  constructor(message: string) {
    super(NotFoundError.name, message);
  }
}

export class UnknownFileSystemError extends ErrorBase {
  constructor(message: string) {
    super(UnknownFileSystemError.name, message);
  }
}

// TODO: Turn to class FileSystemError
export type FileSystemError =
  | FileExistsError
  | PermissionDeniedError
  | NotEmptyError
  | NotFoundError
  | UnknownFileSystemError;
