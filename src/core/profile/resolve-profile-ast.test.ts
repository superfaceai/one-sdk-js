import type { ProfileDocumentNode } from '@superfaceai/ast';
import { EXTENSIONS } from '@superfaceai/ast';

import type { IFileSystem } from '../../interfaces';
import { err, ok } from '../../lib';
import {
  MockEnvironment,
  MockFileSystem,
  mockProfileDocumentNode,
  MockTimers,
} from '../../mock';
import { NodeCrypto, NodeFetch, NodeLogger } from '../../node';
import { normalizeSuperJsonDocument } from '../../schema-tools/superjson/normalize';
import { Config } from '../config';
import {
  NotFoundError,
  profileFileNotFoundError,
  sourceFileExtensionFoundError,
  unableToResolveProfileError,
  unsupportedFileExtensionError,
  versionMismatchError,
} from '../errors';
import { fetchProfileAst } from '../registry';
import { resolveProfileAst } from './resolve-profile-ast';

jest.mock('../../core/registry');

const mockSuperJson = normalizeSuperJsonDocument(
  {
    profiles: {
      'testy/mctestface': '0.1.0',
      foo: 'file://../foo.supr.ast.json',
      'evil/foo': 'file://../foo.supr',
      'bad/foo': 'file://../foo.ts',
      bar: {
        file: '../bar.supr.ast.json',
        providers: {
          quz: {},
        },
      },
      baz: {
        version: '1.2.3',
        providers: {
          quz: {},
        },
      },
      fru: {
        file: '../fru.supr',
        providers: {
          quz: {},
        },
      },
    },
    providers: {
      fooder: {
        file: '../fooder.provider.json',
        security: [],
      },
      quz: {},
    },
  },
  new MockEnvironment()
);

const createMockFileSystem = (
  profileId: string,
  profilePath: string,
  profileVersion: string,
  result: ProfileDocumentNode | NotFoundError,
  exist?: boolean
): IFileSystem =>
  MockFileSystem({
    path: {
      resolve: (...pathSegments: string[]) => pathSegments.join(''),
    },
    exists: () => Promise.resolve(exist !== undefined ? exist : false),
    readFile: jest.fn(path => {
      if (result instanceof NotFoundError) {
        return Promise.resolve(err(result));
      }

      const cachePath = [
        new Config(MockFileSystem()).cachePath,
        'profiles',
        profileId + '@' + profileVersion + EXTENSIONS.profile.build,
      ].join('/');

      if (!path.includes(cachePath) && !path.includes(profilePath)) {
        throw new Error(
          `Path: "${path}" does not contain path to profile "${profilePath}" or path to cache: "${cachePath}"`
        );
      }

      return Promise.resolve(ok(JSON.stringify(result)));
    }),
  });

describe('resolveProfileAst', () => {
  const logger = new NodeLogger();
  const crypto = new NodeCrypto();
  const timers = new MockTimers();
  let fileSystem = MockFileSystem();
  const fetchInstance = new NodeFetch(timers);
  const config = new Config(fileSystem, {
    disableReporting: true,
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.resetAllMocks();
  });

  it('rejects when profile does not exists and version is not specified', async () => {
    await expect(
      resolveProfileAst({
        profileId: 'does/not-exist',
        superJson: mockSuperJson,
        config,
        crypto,
        fileSystem,
        fetchInstance,
        logger,
      })
    ).rejects.toThrow(unableToResolveProfileError('does/not-exist'));
  });

  describe('when passing version', () => {
    describe('when profile is defined in super.json', () => {
      it('returns a valid profile when it points to existing path', async () => {
        fileSystem = createMockFileSystem(
          'foo',
          'foo.supr.ast.json',
          '1.0.1',
          mockProfileDocumentNode({
            name: 'foo',
            version: {
              major: 1,
              minor: 0,
              patch: 1,
              label: 'test',
            },
          })
        );

        const ast = await resolveProfileAst({
          profileId: 'foo',
          version: '1.0.1',
          superJson: mockSuperJson,
          config,
          crypto,
          fileSystem,
          fetchInstance,
          logger,
        });
        expect(ast.header.version).toEqual({
          major: 1,
          minor: 0,
          patch: 1,
          label: 'test',
        });
      });

      it('returns a valid profile when profile is found in cache', async () => {
        fileSystem = createMockFileSystem(
          'testy/mctestface',
          'testy/mctestface@0.1.0.supr.ast.json',
          '0.1.0',
          mockProfileDocumentNode({
            name: 'mctestface',
            scope: 'testy',
            version: {
              major: 0,
              minor: 1,
              patch: 0,
            },
          })
        );

        const ast = await resolveProfileAst({
          profileId: 'testy/mctestface',
          version: '0.1.0',
          superJson: mockSuperJson,
          config,
          crypto,
          fileSystem,
          fetchInstance,
          logger,
        });
        expect(ast.header.version).toEqual({
          major: 0,
          minor: 1,
          patch: 0,
        });
      });

      it('returns a valid profile when profile is found in registry', async () => {
        jest.mocked(fetchProfileAst).mockResolvedValue(
          mockProfileDocumentNode({
            name: 'mctestface',
            scope: 'testy',
            version: {
              major: 0,
              minor: 1,
              patch: 0,
            },
          })
        );
        fileSystem = createMockFileSystem(
          'testy/mctestface',
          'testy/mctestface@0.1.0.supr.ast.json',
          '0.1.0',
          new NotFoundError('test')
        );

        const ast = await resolveProfileAst({
          profileId: 'testy/mctestface',
          version: '0.1.0',
          superJson: mockSuperJson,
          config,
          crypto,
          fileSystem,
          fetchInstance,
          logger,
        });

        expect(ast.header.version).toEqual({ major: 0, minor: 1, patch: 0 });
        expect(fetchProfileAst).toHaveBeenCalledWith(
          'testy/mctestface@0.1.0',
          config,
          crypto,
          fetchInstance,
          logger
        );
      });

      it('throws when there is a version mismatch', async () => {
        fileSystem = createMockFileSystem(
          'testy/mctestface',
          'testy/mctestface@1.1.0.supr.ast.json',
          '1.1.0',
          mockProfileDocumentNode({
            name: 'mctestface',
            scope: 'testy',
            version: {
              major: 1,
              minor: 1,
              patch: 0,
            },
          })
        );

        await expect(
          resolveProfileAst({
            profileId: 'testy/mctestface',
            version: '1.1.0',
            superJson: mockSuperJson,
            config,
            crypto,
            fileSystem,
            fetchInstance,
            logger,
          })
        ).rejects.toThrow(versionMismatchError('0.1.0', '1.1.0'));
      });
    });

    describe('when profile is not defined in super.json', () => {
      it('returns a valid profile when profile is found in registry', async () => {
        jest.mocked(fetchProfileAst).mockResolvedValue(
          mockProfileDocumentNode({
            name: 'mctestface',
            scope: 'testy',
            version: {
              major: 0,
              minor: 1,
              patch: 0,
            },
          })
        );
        fileSystem = createMockFileSystem(
          'testy/mctestface',
          'testy/mctestface@0.1.0.supr.ast.json',
          '0.1.0',
          new NotFoundError('test')
        );

        const ast = await resolveProfileAst({
          profileId: 'testy/mctestface',
          version: '0.1.0',
          // empty super.json
          superJson: normalizeSuperJsonDocument({}, new MockEnvironment()),
          config,
          crypto,
          fileSystem,
          fetchInstance,
          logger,
        });

        expect(ast.header.version).toEqual({ major: 0, minor: 1, patch: 0 });
        expect(fetchProfileAst).toHaveBeenCalledWith(
          'testy/mctestface@0.1.0',
          config,
          crypto,
          fetchInstance,
          logger
        );
      });
    });
  });

  describe('when using entry with version only', () => {
    it('returns a valid profile when profile is found in registry', async () => {
      jest.mocked(fetchProfileAst).mockResolvedValue(
        mockProfileDocumentNode({
          name: 'mctestface',
          scope: 'testy',
          version: {
            major: 0,
            minor: 1,
            patch: 0,
          },
        })
      );
      fileSystem = createMockFileSystem(
        'testy/mctestface',
        'testy/mctestface@0.1.0.supr.ast.json',
        '0.1.0',
        new NotFoundError('test')
      );

      const ast = await resolveProfileAst({
        profileId: 'testy/mctestface',
        superJson: mockSuperJson,
        config,
        crypto,
        fileSystem,
        fetchInstance,
        logger,
      });

      expect(ast.header.version).toEqual({ major: 0, minor: 1, patch: 0 });
      expect(fetchProfileAst).toHaveBeenCalledWith(
        'testy/mctestface@0.1.0',
        config,
        crypto,
        fetchInstance,
        logger
      );
    });
  });

  describe('when using entry with filepath only', () => {
    it('rejects when profile points to a non-existent path', async () => {
      const mockError = new NotFoundError('file not found');
      fileSystem = createMockFileSystem(
        'testy/mctestface',
        'testy/mctestface@0.1.0.supr.ast.json',
        '0.1.0',
        mockError
      );

      await expect(
        resolveProfileAst({
          profileId: 'foo',
          superJson: mockSuperJson,
          config,
          crypto,
          fileSystem,
          fetchInstance,
          logger,
        })
      ).rejects.toThrow(
        profileFileNotFoundError(
          fileSystem.path.resolve(
            fileSystem.path.dirname(config.superfacePath),
            '../foo.supr.ast.json'
          ),
          'foo'
        )
      );
    });

    it('reject when profile points to source file without existance of build file', async () => {
      fileSystem = createMockFileSystem(
        'evil/foo',
        'foo.supr.ast.json',
        '1.0.1',
        mockProfileDocumentNode({
          name: 'foo',
          version: {
            major: 1,
            minor: 0,
            patch: 1,
            label: 'test',
          },
        }),
        false
      );
      await expect(
        resolveProfileAst({
          profileId: 'evil/foo',
          superJson: mockSuperJson,
          config,
          crypto,
          fileSystem,
          fetchInstance,
          logger,
        })
      ).rejects.toThrow(
        sourceFileExtensionFoundError(EXTENSIONS.profile.source)
      );
    });

    it('returns a valid profile when it points source file with existance of build file', async () => {
      fileSystem = createMockFileSystem(
        'evil/foo',
        'foo.supr.ast.json',
        '1.0.1',
        mockProfileDocumentNode({
          name: 'foo',
          version: {
            major: 1,
            minor: 0,
            patch: 1,
            label: 'test',
          },
        }),
        true
      );
      const ast = await resolveProfileAst({
        profileId: 'evil/foo',
        superJson: mockSuperJson,
        config,
        crypto,
        fileSystem,
        fetchInstance,
        logger,
      });

      expect(ast.header.version).toEqual({
        major: 1,
        minor: 0,
        patch: 1,
        label: 'test',
      });
    });

    it('rejects when profile points to a path with unsupported extension', async () => {
      await expect(
        resolveProfileAst({
          profileId: 'bad/foo',
          superJson: mockSuperJson,
          config,
          crypto,
          fileSystem: MockFileSystem(),
          fetchInstance,
          logger,
        })
      ).rejects.toThrow(
        unsupportedFileExtensionError(
          MockFileSystem().path.resolve(
            MockFileSystem().path.dirname(config.superfacePath),
            '../foo.ts'
          ),
          EXTENSIONS.profile.source
        )
      );
    });

    it('returns a valid profile when it points to existing path', async () => {
      fileSystem = createMockFileSystem(
        'foo',
        'foo.supr.ast.json',
        '1.0.1',
        mockProfileDocumentNode({
          name: 'foo',
          version: {
            major: 1,
            minor: 0,
            patch: 1,
            label: 'test',
          },
        })
      );

      const ast = await resolveProfileAst({
        profileId: 'foo',
        superJson: mockSuperJson,
        config,
        crypto,
        fileSystem,
        fetchInstance,
        logger,
      });
      expect(ast.header.version).toEqual({
        major: 1,
        minor: 0,
        patch: 1,
        label: 'test',
      });
    });

    it('rejects when loaded file is not valid ProfileDocumentNode', async () => {
      const invalidAst: any = mockProfileDocumentNode({ name: 'foo' });
      invalidAst.kind = 'broken';
      fileSystem = createMockFileSystem(
        'foo',
        'foo.supr.ast.json',
        '',
        invalidAst
      );

      await expect(
        resolveProfileAst({
          profileId: 'bad/foo',
          superJson: mockSuperJson,
          config,
          crypto,
          fileSystem,
          fetchInstance,
          logger,
        })
      ).rejects.toThrow();
    });
  });

  describe('when using version property', () => {
    it('returns a valid profile when profile is found in registry', async () => {
      jest.mocked(fetchProfileAst).mockResolvedValue(
        mockProfileDocumentNode({
          name: 'baz',
          version: {
            major: 1,
            minor: 2,
            patch: 3,
          },
        })
      );
      fileSystem = createMockFileSystem(
        'baz',
        'baz@1.2.3.supr.ast.json',
        '1.2.3',
        new NotFoundError('test')
      );

      const ast = await resolveProfileAst({
        profileId: 'baz',
        superJson: mockSuperJson,
        config,
        crypto,
        fileSystem,
        fetchInstance,
        logger,
      });
      expect(ast.header.version).toEqual({ major: 1, minor: 2, patch: 3 });

      expect(fetchProfileAst).toHaveBeenCalledWith(
        'baz@1.2.3',
        config,
        crypto,
        fetchInstance,
        logger
      );
    });
  });

  describe('when using file property', () => {
    it('rejects when profile points to source file without existence of build file', async () => {
      fileSystem = MockFileSystem({
        exists: () => Promise.resolve(false),
      });

      await expect(
        resolveProfileAst({
          profileId: 'fru',
          superJson: mockSuperJson,
          config,
          crypto,
          fileSystem,
          fetchInstance,
          logger,
        })
      ).rejects.toThrow(
        sourceFileExtensionFoundError(EXTENSIONS.profile.source)
      );
    });

    it('rejects when profile points to a non-existent path', async () => {
      const mockError = new NotFoundError('file not found');
      fileSystem = createMockFileSystem(
        'bar',
        'bar.supr.ast.json',
        '',
        mockError
      );

      await expect(
        resolveProfileAst({
          profileId: 'bar',
          superJson: mockSuperJson,
          config,
          crypto,
          fileSystem,
          fetchInstance,
          logger,
        })
      ).rejects.toThrow(
        profileFileNotFoundError(
          fileSystem.path.resolve(
            fileSystem.path.dirname(config.superfacePath),
            '../bar.supr.ast.json'
          ),
          'bar'
        )
      );
    });

    it('returns a valid profile when it points to existing path', async () => {
      fileSystem = createMockFileSystem(
        'bar',
        'bar.supr.ast.json',
        '1.0.1',
        mockProfileDocumentNode({
          name: 'bar',
          version: {
            major: 1,
            minor: 0,
            patch: 1,
          },
        })
      );

      const ast = await resolveProfileAst({
        profileId: 'bar',
        superJson: mockSuperJson,
        config,
        crypto,
        fileSystem,
        fetchInstance,
        logger,
      });
      expect(ast.header.version).toEqual({ major: 1, minor: 0, patch: 1 });
    });

    it('rejects when loaded file is not valid ProfileDocumentNode', async () => {
      const invalidAst: any = mockProfileDocumentNode({ name: 'bar' });
      invalidAst.kind = 'broken';
      fileSystem = createMockFileSystem(
        'bar',
        'bar.supr.ast.json',
        '',
        invalidAst
      );

      await expect(
        resolveProfileAst({
          profileId: 'bar',
          superJson: mockSuperJson,
          config,
          crypto,
          fileSystem,
          fetchInstance,
          logger,
        })
      ).rejects.toThrow();
    });
  });
});
