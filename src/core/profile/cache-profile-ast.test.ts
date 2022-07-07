import { EXTENSIONS } from '@superfaceai/ast';

import type { IConfig, IFileSystem } from '../../interfaces';
import { err, ok } from '../../lib';
import { MockFileSystem, mockProfileDocumentNode } from '../../mock';
import { Config } from '../config';
import { NotFoundError } from '../errors';
import { cacheProfileAst, tryToLoadCachedAst } from './cache-profile-ast';

describe('profile AST caching', () => {
  let fileSystem: IFileSystem;
  let config: IConfig;

  beforeEach(async () => {
    fileSystem = MockFileSystem();
    config = new Config(fileSystem);
  });

  afterEach(async () => {
    jest.resetAllMocks();
  });

  describe('cacheProfileAst', () => {
    it('should cache profile ast', async () => {
      const ast = mockProfileDocumentNode();

      await expect(
        cacheProfileAst({
          ast,
          config,
          fileSystem,
        })
      ).resolves.toBeUndefined();

      expect(fileSystem.mkdir).toHaveBeenCalledWith(config.cachePath, {
        recursive: true,
      });

      expect(fileSystem.writeFile).toHaveBeenCalledWith(
        config.cachePath + '/' + ast.header.name + EXTENSIONS.profile.build,
        JSON.stringify(ast, undefined, 2)
      );
    });

    it('should cache profile ast with custom path', async () => {
      const ast = mockProfileDocumentNode({ scope: 'scope' });
      const config = new Config(fileSystem, { cachePath: 'custom/path' });

      await expect(
        cacheProfileAst({
          ast,
          config,
          fileSystem,
        })
      ).resolves.toBeUndefined();

      expect(fileSystem.mkdir).toHaveBeenCalledWith('custom/path/scope', {
        recursive: true,
      });

      expect(fileSystem.writeFile).toHaveBeenCalledWith(
        'custom/path/scope/' + ast.header.name + EXTENSIONS.profile.build,
        JSON.stringify(ast, undefined, 2)
      );
    });

    it('should cache profile ast with scope', async () => {
      const ast = mockProfileDocumentNode({ scope: 'scope' });

      await expect(
        cacheProfileAst({
          ast,
          config,
          fileSystem,
        })
      ).resolves.toBeUndefined();

      expect(fileSystem.mkdir).toHaveBeenCalledWith(
        config.cachePath + '/scope',
        {
          recursive: true,
        }
      );

      expect(fileSystem.writeFile).toHaveBeenCalledWith(
        config.cachePath +
          '/scope/' +
          ast.header.name +
          EXTENSIONS.profile.build,
        JSON.stringify(ast, undefined, 2)
      );
    });

    it('should not cache profile when caching is disabled', async () => {
      const ast = mockProfileDocumentNode({ scope: 'scope' });
      const config = new Config(fileSystem, { cache: false });

      await expect(
        cacheProfileAst({
          ast,
          config,
          fileSystem,
        })
      ).resolves.toBeUndefined();

      expect(fileSystem.mkdir).not.toBeCalled();

      expect(fileSystem.writeFile).not.toBeCalled();
    });
  });

  describe('tryToLoadCachedAst', () => {
    it('should load profile ast', async () => {
      const ast = mockProfileDocumentNode({ scope: 'scope' });
      fileSystem = MockFileSystem({
        readFile: jest.fn(() => Promise.resolve(ok(JSON.stringify(ast)))),
      });

      await expect(
        tryToLoadCachedAst({
          profileId: 'scope/test',
          version: '1.0.0',
          config,
          fileSystem,
        })
      ).resolves.toEqual(ast);

      expect(fileSystem.readFile).toHaveBeenCalledWith(
        config.cachePath +
          '/scope/' +
          ast.header.name +
          EXTENSIONS.profile.build
      );
    });

    it('should load profile ast with custom path', async () => {
      const ast = mockProfileDocumentNode({ scope: 'scope' });

      fileSystem = MockFileSystem({
        readFile: jest.fn(() => Promise.resolve(ok(JSON.stringify(ast)))),
      });
      const config = new Config(fileSystem, { cachePath: 'custom/path' });

      await expect(
        tryToLoadCachedAst({
          profileId: 'scope/test',
          version: '1.0.0',
          config,
          fileSystem,
        })
      ).resolves.toEqual(ast);

      expect(fileSystem.readFile).toHaveBeenCalledWith(
        'custom/path/scope/' + ast.header.name + EXTENSIONS.profile.build
      );
    });

    it('should return undefined when caching is disabled', async () => {
      const config = new Config(fileSystem, { cache: false });

      await expect(
        tryToLoadCachedAst({
          profileId: 'scope/test',
          version: '1.0.0',
          config,
          fileSystem,
        })
      ).resolves.toBeUndefined();

      expect(fileSystem.readFile).not.toHaveBeenCalled();
    });

    it('should return undefined when there is a problem reading file', async () => {
      fileSystem = MockFileSystem({
        readFile: jest.fn(() =>
          Promise.resolve(err(new NotFoundError('test')))
        ),
      });
      const config = new Config(fileSystem);

      await expect(
        tryToLoadCachedAst({
          profileId: 'scope/test',
          version: '1.0.0',
          config,
          fileSystem,
        })
      ).resolves.toBeUndefined();

      expect(fileSystem.readFile).toHaveBeenCalledWith(
        config.cachePath + '/scope/test' + EXTENSIONS.profile.build
      );
    });

    it('should return undefined when there is a problem parsing file content', async () => {
      fileSystem = MockFileSystem({
        readFile: jest.fn(() => Promise.resolve(ok('not-a-json'))),
      });
      const config = new Config(fileSystem);

      await expect(
        tryToLoadCachedAst({
          profileId: 'scope/test',
          version: '1.0.0',
          config,
          fileSystem,
        })
      ).resolves.toBeUndefined();

      expect(fileSystem.readFile).toHaveBeenCalledWith(
        config.cachePath + '/scope/test' + EXTENSIONS.profile.build
      );
    });

    it('should return undefined when loaded AST is not valid', async () => {
      fileSystem = MockFileSystem({
        readFile: jest.fn(() => Promise.resolve(ok('{}'))),
      });
      const config = new Config(fileSystem);

      await expect(
        tryToLoadCachedAst({
          profileId: 'scope/test',
          version: '1.0.0',
          config,
          fileSystem,
        })
      ).resolves.toBeUndefined();

      expect(fileSystem.readFile).toHaveBeenCalledWith(
        config.cachePath + '/scope/test' + EXTENSIONS.profile.build
      );
    });

    it('should return undefined when loaded id does not match', async () => {
      fileSystem = MockFileSystem({
        readFile: jest.fn(() =>
          Promise.resolve(
            ok(JSON.stringify(mockProfileDocumentNode({ name: 'meow' })))
          )
        ),
      });
      const config = new Config(fileSystem);

      await expect(
        tryToLoadCachedAst({
          profileId: 'scope/test',
          version: '1.0.0',
          config,
          fileSystem,
        })
      ).resolves.toBeUndefined();

      expect(fileSystem.readFile).toHaveBeenCalledWith(
        config.cachePath + '/scope/test' + EXTENSIONS.profile.build
      );
    });

    it('should return undefined when loaded version does not match', async () => {
      fileSystem = MockFileSystem({
        readFile: jest.fn(() =>
          Promise.resolve(
            ok(
              JSON.stringify(
                mockProfileDocumentNode({
                  scope: 'scope',
                  version: { major: 2, minor: 3, patch: 4 },
                })
              )
            )
          )
        ),
      });
      const config = new Config(fileSystem);

      await expect(
        tryToLoadCachedAst({
          profileId: 'scope/test',
          version: '1.0.0',
          config,
          fileSystem,
        })
      ).resolves.toBeUndefined();

      expect(fileSystem.readFile).toHaveBeenCalledWith(
        config.cachePath + '/scope/test' + EXTENSIONS.profile.build
      );
    });
  });
});
