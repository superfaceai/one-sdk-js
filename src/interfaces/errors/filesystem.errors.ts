export interface IFileExistsError extends Error {
  name: 'FileExistsError';
}

export interface IPermissionDeniedError extends Error {
  name: 'PermissionDeniedError';
}

export interface INotEmptyError extends Error {
  name: 'NotEmptyError';
}

export interface INotFoundError extends Error {
  name: 'NotFoundError';
}

export interface IUnknownFileSystemError extends Error {
  name: 'UnknownFileSystemError';
}

export type IFileSystemError =
  | IFileExistsError
  | IPermissionDeniedError
  | INotEmptyError
  | INotFoundError
  | IUnknownFileSystemError;
