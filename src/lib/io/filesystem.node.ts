import * as fs from 'fs';
import { promises as fsp } from 'fs';
import { dirname, join, normalize, relative, resolve } from 'path';

import { IFileSystem } from './filesystem';

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
  const stat = await fsp.stat(path);

  return stat.isDirectory();
}

function isDirectorySync(path: string): boolean {
  const stat = fs.statSync(path);

  return stat.isDirectory();
}

async function isFile(path: string): Promise<boolean> {
  const stat = await fsp.stat(path);

  return stat.isFile();
}

function isFileSync(path: string): boolean {
  const stat = fs.statSync(path);

  return stat.isFile();
}

function joinPath(...path: string[]): string {
  return join(...path);
}

async function mkdir(
  path: string,
  options?: { recursive?: boolean }
): Promise<void> {
  await fsp.mkdir(path, { recursive: options?.recursive === true });
}

function mkdirSync(path: string, options?: { recursive?: boolean }): void {
  fs.mkdirSync(path, { recursive: options?.recursive === true });
}

async function readFile(path: string): Promise<string> {
  return fsp.readFile(path, 'utf8');
}

function readFileSync(path: string): string {
  return fs.readFileSync(path, 'utf8');
}

async function readdir(path: string): Promise<string[]> {
  return fsp.readdir(path);
}

function readdirSync(path: string): string[] {
  return fs.readdirSync(path);
}

function resolvePath(...pathSegments: string[]): string {
  return resolve(...pathSegments);
}

function relativePath(from: string, to: string): string {
  return relative(from, to);
}

async function rm(
  path: string,
  options?: { recursive?: boolean }
): Promise<void> {
  if (options?.recursive) {
    await fsp.rmdir(path, { recursive: true });
  } else {
    await fsp.unlink(path);
  }
}

function rmSync(path: string, options?: { recursive?: boolean }): void {
  if (options?.recursive) {
    fs.rmdirSync(path, { recursive: true });
  } else {
    fs.unlinkSync(path);
  }
}

async function writeFile(path: string, data: string): Promise<void> {
  await fsp.writeFile(path, data, 'utf8');
}

function writeFileSync(path: string, data: string): void {
  fs.writeFileSync(path, data, 'utf8');
}

export const NodeFileSystem: IFileSystem = {
  dirname,
  exists,
  existsSync,
  isAccessible,
  isAccessibleSync,
  isDirectory,
  isDirectorySync,
  isFile,
  isFileSync,
  joinPath,
  mkdir,
  mkdirSync,
  normalize,
  readFile,
  readFileSync,
  readdir,
  readdirSync,
  resolvePath,
  relativePath,
  rm,
  rmSync,
  writeFile,
  writeFileSync,
};
