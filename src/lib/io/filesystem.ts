export interface IFileSystem {
  /**
   * Returns the directory name of the given path.
   */
  dirname: (path: string) => string;

  /**
   * Returns `true` if directory or file exists.
   */
  exists: (path: string) => Promise<boolean>;

  /**
   * Returns `true` if directory or file exists.
   * Synchronous version.
   */
  existsSync: (path: string) => boolean;

  /**
   * Returns `true` if directory or file
   * exists, is readable and writable for the current user.
   */
  isAccessible: (path: string) => Promise<boolean>;

  /**
   * Returns `true` if directory or file
   * exists, is readable and writable for the current user.
   * Synchronous version.
   */
  isAccessibleSync: (path: string) => boolean;

  /**
   * Returns `true` if `path` is a directory.
   */
  isDirectory: (path: string) => Promise<boolean>;

  /**
   * Returns `true` if `path` is a directory.
   * Synchronous version.
   */
  isDirectorySync: (path: string) => boolean;

  /**
   * Returns `true` if `path` is a file.
   */
  isFile: (path: string) => Promise<boolean>;

  /**
   * Returns `true` if `path` is a file.
   * Synchronous version.
   */
  isFileSync: (path: string) => boolean;

  /**
   * Joins path with platform specific separator.
   */
  joinPath: (...path: string[]) => string;

  /**
   * Creates a directory if it does not exist.
   */
  mkdir: (path: string, options?: { recursive?: boolean }) => Promise<void>;

  /**
   * Creates a directory if it does not exist.
   * Synchronous version.
   */
  mkdirSync: (path: string, options?: { recursive?: boolean }) => void;

  /**
   * Normalizes the given path.
   */
  normalize: (path: string) => string;

  /**
   * Reads file content as string.
   */
  readFile: (path: string) => Promise<string>;

  /**
   * Reads file content as string.
   * Synchronous version.
   */
  readFileSync: (path: string) => string;

  /**
   * Returns list of files at `path`.
   */
  readdir: (path: string) => Promise<string[]>;

  /**
   * Returns list of files at `path`.
   * Synchronous version.
   */
  readdirSync: (path: string) => string[];

  /**
   * Resolves path from left to the rightmost argument as an absolute path.
   */
  resolvePath: (...pathSegments: string[]) => string;

  /**
   * Return the relative path from directory `from` to directory `to`.
   */
  relativePath: (from: string, to: string) => string;

  /**
   * Removes file or director if it exists.
   */
  rm: (path: string, options?: { recursive?: boolean }) => Promise<void>;

  /**
   * Removes file or director if it exists.
   * Synchronous version.
   */
  rmSync: (path: string, options?: { recursive?: boolean }) => void;

  /**
   * Writes string to file.
   */
  writeFile: (path: string, data: string) => Promise<void>;

  /**
   * Writes string to file.
   * Synchronous version.
   */
  writeFileSync: (path: string, data: string) => void;
}
