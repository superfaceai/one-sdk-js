import { FileSystemError, IFileSystem } from '../core';
import { ok, Result } from '../lib/result/result';

export const MockFileSystem: () => IFileSystem = () => ({
  sync: {
    exists: jest.fn(() => true),
    isAccessible: jest.fn(() => true),
    isDirectory: jest.fn(() => false),
    isFile: jest.fn(() => true),
    mkdir: jest.fn(() => ok(undefined)),
    readFile: jest.fn(() => ok('')),
    readdir: jest.fn(() => ok([])),
    rm: jest.fn(() => ok(undefined)),
    writeFile: jest.fn(() => ok(undefined)),
  },
  path: {
    cwd: jest.fn(() => '.'),
    dirname: jest.fn(() => ''),
    join: jest.fn((...strings: string[]) => strings.join('/')),
    normalize: jest.fn((path: string) => path),
    resolve: jest.fn(() => ''),
    relative: jest.fn(() => ''),
  },
  exists: jest.fn(async () => true),
  isAccessible: jest.fn(async () => true),
  isDirectory: jest.fn(async () => true),
  isFile: jest.fn(async () => true),
  mkdir: jest.fn(
    async (): Promise<Result<void, FileSystemError>> => ok(undefined)
  ),
  readFile: jest.fn(
    async (): Promise<Result<string, FileSystemError>> => ok('')
  ),
  readdir: jest.fn(
    async (): Promise<Result<string[], FileSystemError>> => ok([])
  ),
  rm: jest.fn(
    async (): Promise<Result<void, FileSystemError>> => ok(undefined)
  ),
  writeFile: jest.fn(
    async (): Promise<Result<void, FileSystemError>> => ok(undefined)
  ),
});
