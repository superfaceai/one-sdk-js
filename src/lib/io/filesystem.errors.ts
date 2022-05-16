import { UnexpectedError } from '../../internal';

export type SystemError = Error & { code: string };
export function assertSystemError(
  error: unknown
): asserts error is SystemError {
  if (
    typeof error !== 'object' ||
    !('code' in (error as Record<string, unknown>))
  ) {
    throw new UnexpectedError('Unexpected system error', error);
  }
}

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

export function handleNodeError(e: unknown): FileSystemError {
  assertSystemError(e);

  if (e.code === 'EACCES') {
    return new PermissionDeniedError(e.message);
  }

  if (e.code === 'ENOENT') {
    return new NotFoundError(e.message);
  }

  if (e.code === 'EEXIST') {
    return new FileExistsError(e.message);
  }

  if (e.code === 'ENOTEMPTY') {
    return new NotEmptyError(e.message);
  }

  return new UnknownFileSystemError(e.message);
}
