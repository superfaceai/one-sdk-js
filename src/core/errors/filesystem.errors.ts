import { ErrorBase } from './errors';

export abstract class FileSystemError extends ErrorBase {}

export class FileExistsError extends FileSystemError {
  constructor(message: string) {
    super(FileExistsError.name, message);
  }
}

export class PermissionDeniedError extends FileSystemError {
  constructor(message: string) {
    super(PermissionDeniedError.name, message);
  }
}

export class NotEmptyError extends FileSystemError {
  constructor(message: string) {
    super(NotEmptyError.name, message);
  }
}

export class NotFoundError extends FileSystemError {
  constructor(message: string) {
    super(NotFoundError.name, message);
  }
}

export class UnknownFileSystemError extends FileSystemError {
  constructor(message: string) {
    super(UnknownFileSystemError.name, message);
  }
}
