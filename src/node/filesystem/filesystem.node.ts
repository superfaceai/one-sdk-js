import * as fs from 'fs';
import { promises as fsp } from 'fs';
import {
  dirname,
  join as joinPath,
  normalize,
  relative as relativePath,
  resolve as resolvePath,
} from 'path';

import type { FileSystemError, IFileSystem } from '../../core';
import {
  FileExistsError,
  NotEmptyError,
  NotFoundError,
  PermissionDeniedError,
  UnexpectedError,
  UnknownFileSystemError,
} from '../../core';
import type { Result } from '../../lib';
import { err, ok } from '../../lib';

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

function cwd(): string {
  return process.cwd();
}

async function exists(path: string): Promise<boolean> {
  try {
    await fsp.access(path);
  } catch (err) {
    if (typeof err === 'object' && err !== null) {
      if ('code' in err) {
        const ioErr = err as { code: string };
        if (ioErr.code === 'ENOENT') {
          return false;
        }
      }
    }

    throw err;
  }

  return true;
}

function existsSync(path: string): boolean {
  try {
    fs.accessSync(path);
  } catch (err) {
    if (typeof err === 'object' && err !== null) {
      if ('code' in err) {
        const ioErr = err as { code: string };
        if (ioErr.code === 'ENOENT') {
          return false;
        }
      }
    }

    throw err;
  }

  return true;
}

async function isAccessible(path: string): Promise<boolean> {
  try {
    await fsp.access(
      path,
      fs.constants.F_OK | fs.constants.R_OK | fs.constants.W_OK
    );
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null) {
      if ('code' in err) {
        const ioErr = err as { code: string };
        if (ioErr.code === 'ENOENT' || ioErr.code === 'EACCES') {
          return false;
        }
      }
    }

    throw err;
  }

  return true;
}

function isAccessibleSync(path: string): boolean {
  try {
    fs.accessSync(
      path,
      fs.constants.F_OK | fs.constants.R_OK | fs.constants.W_OK
    );
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null) {
      if ('code' in err) {
        const ioErr = err as { code: string };
        if (ioErr.code === 'ENOENT' || ioErr.code === 'EACCES') {
          return false;
        }
      }
    }

    throw err;
  }

  return true;
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    const stat = await fsp.stat(path);

    return stat.isDirectory();
  } catch (e) {
    return false;
  }
}

function isDirectorySync(path: string): boolean {
  try {
    const stat = fs.statSync(path);

    return stat.isDirectory();
  } catch (e) {
    return false;
  }
}

async function isFile(path: string): Promise<boolean> {
  try {
    const stat = await fsp.stat(path);

    return stat.isFile();
  } catch (e) {
    return false;
  }
}

function isFileSync(path: string): boolean {
  try {
    const stat = fs.statSync(path);

    return stat.isFile();
  } catch (e) {
    return false;
  }
}

function join(...path: string[]): string {
  return joinPath(...path);
}

async function mkdir(
  path: string,
  options?: { recursive?: boolean }
): Promise<Result<void, FileSystemError>> {
  try {
    await fsp.mkdir(path, { recursive: options?.recursive === true });
  } catch (e) {
    const error = handleNodeError(e);

    // If the directory already exists, our job here is done
    if (error instanceof FileExistsError) {
      return ok(undefined);
    }

    return err(error);
  }

  return ok(undefined);
}

function mkdirSync(
  path: string,
  options?: { recursive?: boolean }
): Result<void, FileSystemError> {
  try {
    fs.mkdirSync(path, { recursive: options?.recursive === true });
  } catch (e) {
    const error = handleNodeError(e);

    // If the directory already exists, our job here is done
    if (error instanceof FileExistsError) {
      return ok(undefined);
    }

    return err(error);
  }

  return ok(undefined);
}

async function readFile(
  path: string
): Promise<Result<string, FileSystemError>> {
  try {
    return ok(await fsp.readFile(path, 'utf8'));
  } catch (e) {
    return err(handleNodeError(e));
  }
}

function readFileSync(path: string): Result<string, FileSystemError> {
  try {
    return ok(fs.readFileSync(path, 'utf8'));
  } catch (e) {
    return err(handleNodeError(e));
  }
}

async function readdir(
  path: string
): Promise<Result<string[], FileSystemError>> {
  try {
    return ok(await fsp.readdir(path));
  } catch (e) {
    return err(handleNodeError(e));
  }
}

function readdirSync(path: string): Result<string[], FileSystemError> {
  try {
    return ok(fs.readdirSync(path));
  } catch (e) {
    return err(handleNodeError(e));
  }
}

function resolve(...pathSegments: string[]): string {
  return resolvePath(...pathSegments);
}

function relative(from: string, to: string): string {
  return relativePath(from, to);
}

async function rm(
  path: string,
  options?: { recursive?: boolean }
): Promise<Result<void, FileSystemError>> {
  const isDir = isDirectorySync(path);
  try {
    if (options?.recursive === true || isDir) {
      await fsp.rmdir(path, { recursive: options?.recursive === true });
    } else {
      await fsp.unlink(path);
    }
  } catch (e) {
    return err(handleNodeError(e));
  }

  return ok(undefined);
}

function rmSync(
  path: string,
  options?: { recursive?: boolean }
): Result<void, FileSystemError> {
  const isDir = isDirectorySync(path);
  try {
    if (options?.recursive === true || isDir) {
      fs.rmdirSync(path, { recursive: options?.recursive === true });
    } else {
      fs.unlinkSync(path);
    }
  } catch (e) {
    return err(handleNodeError(e));
  }

  return ok(undefined);
}

async function writeFile(
  path: string,
  data: string
): Promise<Result<void, FileSystemError>> {
  try {
    await fsp.writeFile(path, data, 'utf8');
  } catch (e) {
    return err(handleNodeError(e));
  }

  return ok(undefined);
}

function writeFileSync(
  path: string,
  data: string
): Result<void, FileSystemError> {
  try {
    fs.writeFileSync(path, data, 'utf8');
  } catch (e) {
    return err(handleNodeError(e));
  }

  return ok(undefined);
}

export const NodeFileSystem: IFileSystem = {
  path: {
    cwd,
    dirname,
    join,
    normalize,
    resolve,
    relative,
  },
  sync: {
    exists: existsSync,
    isAccessible: isAccessibleSync,
    isDirectory: isDirectorySync,
    isFile: isFileSync,
    mkdir: mkdirSync,
    readFile: readFileSync,
    readdir: readdirSync,
    rm: rmSync,
    writeFile: writeFileSync,
  },
  exists,
  isAccessible,
  isDirectory,
  isFile,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
};
