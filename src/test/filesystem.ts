import { IFileSystem } from '../lib/io/filesystem';

export const MockFileSystem: () => IFileSystem = () => ({
  dirname: jest.fn(() => ''),
  exists: jest.fn(async () => true),
  existsSync: jest.fn(() => true),
  isAccessible: jest.fn(async () => true),
  isAccessibleSync: jest.fn(() => true),
  isDirectory: jest.fn(async () => true),
  isDirectorySync: jest.fn(() => false),
  isFile: jest.fn(async () => true),
  isFileSync: jest.fn(() => true),
  joinPath: jest.fn((...strings: string[]) => strings.join('/')),
  mkdir: jest.fn(async () => {}),
  mkdirSync: jest.fn(() => {}),
  normalize: jest.fn((path: string) => path),
  readFile: jest.fn(async () => ''),
  readFileSync: jest.fn(() => ''),
  readdir: jest.fn(async () => []),
  readdirSync: jest.fn(() => []),
  resolvePath: jest.fn(() => ''),
  relativePath: jest.fn(() => ''),
  rm: jest.fn(async () => {}),
  rmSync: jest.fn(() => {}),
  writeFile: jest.fn(async () => {}),
  writeFileSync: jest.fn(() => {}),
});
