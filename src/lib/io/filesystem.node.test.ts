import { promises as fsp } from 'fs';
import { tmpdir } from 'os';
import { join as joinPath, sep } from 'path';

import { ok } from '../result/result';
import { NodeFileSystem } from './filesystem.node';

describe('Node filesystem', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fsp.mkdtemp(joinPath(tmpdir(), 'superface-test'));
  });

  afterEach(async () => {
    await fsp.rmdir(tempDir, { recursive: true });
  });

  describe('dirname', () => {
    it('should correctly get directory name from path', () => {
      const path = joinPath('some', 'path', 'to', 'file.ext');
      const expected = joinPath('some', 'path', 'to');
      expect(NodeFileSystem.path.dirname(path)).toEqual(expected);
    });
  });

  describe('exists', () => {
    it('should return true for existing file', async () => {
      const filePath = joinPath(tempDir, 'file.exists');
      await fsp.writeFile(filePath, '');

      expect(await NodeFileSystem.exists(filePath)).toBe(true);
    });

    it('should return false for non-existing file', async () => {
      const filePath = joinPath(tempDir, 'file.doesnt');

      expect(await NodeFileSystem.exists(filePath)).toBe(false);
    });
  });

  describe('existsSync', () => {
    it('should return true for existing file', async () => {
      const filePath = joinPath(tempDir, 'file.exists');
      await fsp.writeFile(filePath, '');

      expect(NodeFileSystem.sync.exists(filePath)).toBe(true);
    });

    it('should return false for non-existing file', async () => {
      const filePath = joinPath(tempDir, 'file.doesnt');

      expect(NodeFileSystem.sync.exists(filePath)).toBe(false);
    });
  });

  describe('isAccessible', () => {
    it('should return true for writable file', async () => {
      const filePath = joinPath(tempDir, 'file.exists');
      await fsp.writeFile(filePath, '');

      expect(await NodeFileSystem.isAccessible(filePath)).toBe(true);
    });

    it('should return false for non-existing file', async () => {
      const filePath = joinPath(tempDir, 'file.doesnt');

      expect(await NodeFileSystem.isAccessible(filePath)).toBe(false);
    });

    it('should return false for non-writable file', async () => {
      const filePath = joinPath(tempDir, 'file.not-writable');
      await fsp.writeFile(filePath, '');
      await fsp.chmod(filePath, 0);

      expect(await NodeFileSystem.isAccessible(filePath)).toBe(false);
    });
  });

  describe('isAccessibleSync', () => {
    it('should return true for writable file', async () => {
      const filePath = joinPath(tempDir, 'file.exists');
      await fsp.writeFile(filePath, '');

      expect(NodeFileSystem.sync.isAccessible(filePath)).toBe(true);
    });

    it('should return false for non-existing file', async () => {
      const filePath = joinPath(tempDir, 'file.doesnt');

      expect(NodeFileSystem.sync.isAccessible(filePath)).toBe(false);
    });

    it('should return false for non-writable file', async () => {
      const filePath = joinPath(tempDir, 'file.not-writable');
      await fsp.writeFile(filePath, '');
      await fsp.chmod(filePath, 0);

      expect(NodeFileSystem.sync.isAccessible(filePath)).toBe(false);
    });
  });

  describe('isDirectory', () => {
    it('should return true for a directory', async () => {
      expect(await NodeFileSystem.isDirectory(tempDir)).toBe(true);
    });

    it('should return false for a file', async () => {
      const filePath = joinPath(tempDir, 'file.exists');
      await fsp.writeFile(filePath, '');

      expect(await NodeFileSystem.isDirectory(filePath)).toBe(false);
    });

    it('should return false for a non-existing file', async () => {
      const filePath = joinPath(tempDir, 'file.doesnt');

      expect(await NodeFileSystem.isDirectory(filePath)).toBe(false);
    });
  });

  describe('isDirectorySync', () => {
    it('should return true for a directory', async () => {
      expect(NodeFileSystem.sync.isDirectory(tempDir)).toBe(true);
    });

    it('should return false for a file', async () => {
      const filePath = joinPath(tempDir, 'file.exists');
      await fsp.writeFile(filePath, '');

      expect(NodeFileSystem.sync.isDirectory(filePath)).toBe(false);
    });

    it('should return false for a non-existing file', async () => {
      const filePath = joinPath(tempDir, 'file.doesnt');

      expect(NodeFileSystem.sync.isDirectory(filePath)).toBe(false);
    });
  });

  describe('isFile', () => {
    it('should return true for a file', async () => {
      const filePath = joinPath(tempDir, 'file.exists');
      await fsp.writeFile(filePath, '');

      expect(await NodeFileSystem.isFile(filePath)).toBe(true);
    });

    it('should return false for a directory', async () => {
      expect(await NodeFileSystem.isFile(tempDir)).toBe(false);
    });

    it('should return false for a non-existing file', async () => {
      const filePath = joinPath(tempDir, 'file.doesnt');

      expect(await NodeFileSystem.isFile(filePath)).toBe(false);
    });
  });

  describe('isFileSync', () => {
    it('should return true for a file', async () => {
      const filePath = joinPath(tempDir, 'file.exists');
      await fsp.writeFile(filePath, '');

      expect(NodeFileSystem.sync.isFile(filePath)).toBe(true);
    });

    it('should return false for a directory', async () => {
      expect(NodeFileSystem.sync.isFile(tempDir)).toBe(false);
    });

    it('should return false for a non-existing file', async () => {
      const filePath = joinPath(tempDir, 'file.doesnt');

      expect(NodeFileSystem.sync.isFile(filePath)).toBe(false);
    });
  });

  describe('joinPath', () => {
    it('should correctly join paths with OS-specific separator', () => {
      const joinedPath = NodeFileSystem.path.join('some', 'path');

      expect(joinedPath).toEqual('some' + sep + 'path');
    });
  });

  describe('mkdir', () => {
    it('should correctly create a directory', async () => {
      const path = joinPath(tempDir, 'some', 'new', 'directory');
      await NodeFileSystem.mkdir(path, { recursive: true });

      expect((await fsp.stat(path)).isDirectory()).toBe(true);
    });
  });

  describe('mkdirSync', () => {
    it('should correctly create a directory', async () => {
      const path = joinPath(tempDir, 'some', 'new', 'directory');
      NodeFileSystem.sync.mkdir(path, { recursive: true });

      expect((await fsp.stat(path)).isDirectory()).toBe(true);
    });
  });

  describe('normalize', () => {
    it('should correctly normalize a path', () => {
      const path = joinPath('some', 'path', '..', 'other', 'path');
      const normalizedPath = joinPath('some', 'other', 'path');

      expect(NodeFileSystem.path.normalize(path)).toEqual(normalizedPath);
    });
  });

  describe('readFile', () => {
    it('should read contents of a file', async () => {
      const filePath = joinPath(tempDir, 'some.file');
      const contents = 'it works!';
      await fsp.writeFile(filePath, contents, 'utf8');

      expect(await NodeFileSystem.readFile(filePath)).toEqual(ok(contents));
    });

    it('should return error when file can not be read', async () => {
      const filePath = joinPath(tempDir, 'file.doesnt');
      const result = await NodeFileSystem.readFile(filePath);

      expect(result.isErr()).toBe(true);
    });
  });

  describe('readFileSync', () => {
    it('should read contents of a file', async () => {
      const filePath = joinPath(tempDir, 'some.file');
      const contents = 'it works!';
      await fsp.writeFile(filePath, contents, 'utf8');

      expect(NodeFileSystem.sync.readFile(filePath)).toEqual(ok(contents));
    });
  });

  describe('readdir', () => {
    it('should read contents of a directory', async () => {
      const files = ['file1', 'file2'];
      const paths = files.map(file => joinPath(tempDir, file));
      for (const path of paths) {
        await fsp.writeFile(path, '', 'utf8');
      }

      expect(await NodeFileSystem.readdir(tempDir)).toEqual(ok(files));
    });
  });

  describe('readdirSync', () => {
    it('should read contents of a directory', async () => {
      const files = ['file1', 'file2'];
      const paths = files.map(file => joinPath(tempDir, file));
      for (const path of paths) {
        await fsp.writeFile(path, '', 'utf8');
      }

      expect(NodeFileSystem.sync.readdir(tempDir)).toEqual(ok(files));
    });
  });

  describe('resolvePath', () => {
    it('should correctly resolve path', () => {
      const path = NodeFileSystem.path.resolve(
        'some',
        'path',
        '..',
        'other',
        'path'
      );
      const resolvedPath = joinPath(process.cwd(), 'some', 'other', 'path');

      expect(path).toEqual(resolvedPath);
    });
  });

  describe('relative path', () => {
    it('should correctly resolve relative path', () => {
      const from = joinPath('some', 'path', 'from', 'somewhere');
      const to = joinPath('some', 'path', 'to', 'somewhere', 'else');
      const relativePath = joinPath('..', '..', 'to', 'somewhere', 'else');

      expect(NodeFileSystem.path.relative(from, to)).toEqual(relativePath);
    });
  });

  describe('rm', () => {
    it('should delete a file', async () => {
      const filePath = joinPath(tempDir, 'some.file');
      await fsp.writeFile(filePath, '');

      expect((await fsp.stat(filePath)).isFile()).toBe(true);
      await NodeFileSystem.rm(filePath);
      await expect(fsp.stat(filePath)).rejects.toThrow();
    });

    it('should delete a directory', async () => {
      const dirPath = joinPath(tempDir, 'somedir');
      await fsp.mkdir(dirPath);

      expect((await fsp.stat(dirPath)).isDirectory()).toBe(true);
      await NodeFileSystem.rm(dirPath);
      await expect(fsp.stat(dirPath)).rejects.toThrow();
    });

    it('should delete a directory recursively', async () => {
      const basePath = joinPath(tempDir, 'some');
      const dirPath = joinPath(basePath, 'other', 'dir');
      await fsp.mkdir(dirPath, { recursive: true });

      expect((await fsp.stat(dirPath)).isDirectory()).toBe(true);
      await NodeFileSystem.rm(basePath, { recursive: true });
      await expect(fsp.stat(dirPath)).rejects.toThrow();
    });

    it('should not delete a non-empty directory', async () => {
      const basePath = joinPath(tempDir, 'some');
      const dirPath = joinPath(basePath, 'other', 'dir');
      await fsp.mkdir(dirPath, { recursive: true });

      expect((await fsp.stat(dirPath)).isDirectory()).toBe(true);
      await NodeFileSystem.rm(basePath, { recursive: false });
      expect((await fsp.stat(dirPath)).isDirectory()).toBe(true);
    });

    it('should fail silently if file does not exist', async () => {
      const filePath = joinPath(tempDir, 'file.doesnt');

      await expect(NodeFileSystem.rm(filePath)).resolves.not.toThrow();
    });
  });

  describe('rmSync', () => {
    it('should delete a file', async () => {
      const filePath = joinPath(tempDir, 'some.file');
      await fsp.writeFile(filePath, '');

      expect((await fsp.stat(filePath)).isFile()).toBe(true);
      NodeFileSystem.sync.rm(filePath);
      await expect(fsp.stat(filePath)).rejects.toThrow();
    });

    it('should delete a directory', async () => {
      const dirPath = joinPath(tempDir, 'somedir');
      await fsp.mkdir(dirPath);

      expect((await fsp.stat(dirPath)).isDirectory()).toBe(true);
      NodeFileSystem.sync.rm(dirPath);
      await expect(fsp.stat(dirPath)).rejects.toThrow();
    });

    it('should delete a directory recursively', async () => {
      const basePath = joinPath(tempDir, 'some');
      const dirPath = joinPath(basePath, 'other', 'dir');
      await fsp.mkdir(dirPath, { recursive: true });

      expect((await fsp.stat(dirPath)).isDirectory()).toBe(true);
      NodeFileSystem.sync.rm(basePath, { recursive: true });
      await expect(fsp.stat(dirPath)).rejects.toThrow();
    });

    it('should not delete a non-empty directory', async () => {
      const basePath = joinPath(tempDir, 'some');
      const dirPath = joinPath(basePath, 'other', 'dir');
      await fsp.mkdir(dirPath, { recursive: true });

      expect((await fsp.stat(dirPath)).isDirectory()).toBe(true);
      const result = NodeFileSystem.sync.rm(basePath, { recursive: false });
      expect(result.isErr()).toBe(true);
      expect((await fsp.stat(dirPath)).isDirectory()).toBe(true);
    });

    it('should fail silently if file does not exist', async () => {
      const filePath = joinPath(tempDir, 'file.doesnt');

      expect(() => NodeFileSystem.sync.rm(filePath)).not.toThrow();
    });
  });

  describe('writeFile', () => {
    it('should write string to a file', async () => {
      const filePath = joinPath(tempDir, 'some.file');
      const contents = 'it works!';
      await NodeFileSystem.writeFile(filePath, contents);

      expect(await fsp.readFile(filePath, 'utf8')).toEqual(contents);
    });
  });
});
