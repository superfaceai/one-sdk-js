import type {
  IFileExistsError,
  INotEmptyError,
  INotFoundError,
  IPermissionDeniedError,
  IUnknownFileSystemError,
} from '../../interfaces';

export class FileExistsError extends Error implements IFileExistsError {
  public override name = 'FileExistsError' as const;

  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, FileExistsError.prototype);
  }
}

export class PermissionDeniedError
  extends Error
  implements IPermissionDeniedError
{
  public override name = 'PermissionDeniedError' as const;

  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, PermissionDeniedError.prototype);
  }
}

export class NotEmptyError extends Error implements INotEmptyError {
  public override name = 'NotEmptyError' as const;
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, NotEmptyError.prototype);
  }
}

export class NotFoundError extends Error implements INotFoundError {
  public override name = 'NotFoundError' as const;
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class UnknownFileSystemError
  extends Error
  implements IUnknownFileSystemError
{
  public override name = 'UnknownFileSystemError' as const;
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, UnknownFileSystemError.prototype);
  }
}

export type FileSystemError =
  | FileExistsError
  | PermissionDeniedError
  | NotEmptyError
  | NotFoundError
  | UnknownFileSystemError;
