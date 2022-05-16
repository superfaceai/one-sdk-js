import { Result } from '../result/result';
import { FileSystemError } from './filesystem.errors';

export interface IFileSystem {
  /**
   * Collection of utilities for working with paths in a OS-specific way
   */
  path: {
    /**
     * Returns the directory name of the given path.
     */
    dirname: (path: string) => string;

    /**
     * Joins path with platform specific separator.
     */
    join: (...path: string[]) => string;

    /**
     * Normalizes the given path.
     */
    normalize: (path: string) => string;

    /**
     * Resolves path from left to the rightmost argument as an absolute path.
     */
    resolve: (...pathSegments: string[]) => string;

    /**
     * Return the relative path from directory `from` to directory `to`.
     */
    relative: (from: string, to: string) => string;
  };

  /**
   * Synchronous variants of filesystem functions
   */
  sync: {
    /**
     * Returns `true` if directory or file exists.
     */
    exists: (path: string) => boolean;
    /**
     * Returns `true` if directory or file
     * exists, is readable and writable for the current user.
     */
    isAccessible: (path: string) => boolean;

    /**
     * Returns `true` if `path` is a directory.
     * Returns `false` if `path` is not a directory or doesn't exist.
     */
    isDirectory: (path: string) => boolean;

    /**
     * Returns `true` if `path` is a file.
     * Returns `false` if `path` is not a file or doesn't exist.
     */
    isFile: (path: string) => boolean;

    /**
     * Creates a directory if it does not exist.
     */
    mkdir: (
      path: string,
      options?: { recursive?: boolean }
    ) => Result<void, FileSystemError>;

    /**
     * Reads file content as string.
     */
    readFile: (path: string) => Result<string, FileSystemError>;

    /**
     * Returns list of files at `path`.
     */
    readdir: (path: string) => Result<string[], FileSystemError>;

    /**
     * Removes file or director if it exists.
     * Fails silently if the directory does not exist or is not possible to remove it
     */
    rm: (
      path: string,
      options?: { recursive?: boolean }
    ) => Result<void, FileSystemError>;

    /**
     * Writes string to file.
     */
    writeFile: (path: string, data: string) => Result<void, FileSystemError>;
  };

  /**
   * Returns `true` if directory or file exists.
   */
  exists: (path: string) => Promise<boolean>;

  /**
   * Returns `true` if directory or file
   * exists, is readable and writable for the current user.
   */
  isAccessible: (path: string) => Promise<boolean>;

  /**
   * Returns `true` if `path` is a directory.
   * Returns `false` if `path` is not a directory or doesn't exist.
   */
  isDirectory: (path: string) => Promise<boolean>;

  /**
   * Returns `true` if `path` is a file.
   * Returns `false` if `path` is not a file or doesn't exist.
   */
  isFile: (path: string) => Promise<boolean>;

  /**
   * Creates a directory if it does not exist.
   */
  mkdir: (
    path: string,
    options?: { recursive?: boolean }
  ) => Promise<Result<void, FileSystemError>>;

  /**
   * Reads file content as string.
   */
  readFile: (path: string) => Promise<Result<string, FileSystemError>>;

  /**
   * Returns list of files at `path`.
   */
  readdir: (path: string) => Promise<Result<string[], FileSystemError>>;

  /**
   * Removes file or directory if it exists.
   * Fails silently if the directory does not exist or is not possible to remove it
   */
  rm: (
    path: string,
    options?: { recursive?: boolean }
  ) => Promise<Result<void, FileSystemError>>;

  /**
   * Writes string to file.
   */
  writeFile: (
    path: string,
    data: string
  ) => Promise<Result<void, FileSystemError>>;
}
