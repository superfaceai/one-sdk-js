import { EXTENSIONS } from '@superfaceai/ast';
import { mocked } from 'ts-jest/utils';

import { err, ok } from '../../lib';
import {
  MockFileSystem,
  mockProfileDocumentNode,
  MockTimers,
} from '../../mock';
import { NodeCrypto, NodeFetch, NodeLogger } from '../../node';
import { SuperJson } from '../../schema-tools';
import { Config } from '../config';
import {
  NotFoundError,
  profileFileNotFoundError,
  sourceFileExtensionFoundError,
  unsupportedFileExtensionError,
} from '../errors';
import { fetchProfileAst } from '../registry';
import { resolveProfileAst } from './resolve-profile-ast';

jest.mock('../../core/registry');

const mockSuperJson = new SuperJson({
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
  },
  providers: {
    fooder: {
      file: '../fooder.provider.json',
      security: [],
    },
    quz: {},
  },
});

// const mockSuperJsonCustomPath = new SuperJson({
//   profiles: {
//     test: '2.1.0',
//   },
//   providers: {
//     quz: {},
//   },
// });

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

  it('rejects when profile does not exists', async () => {
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
    ).rejects.toThrow('Profile "does/not-exist" not found in super.json');
  });

  describe('when using entry with version only', () => {
    it('returns a valid profile when profile is found in grid', async () => {
      fileSystem = MockFileSystem({
        path: {
          resolve: (...pathSegments: string[]) => pathSegments.join(''),
        },
        readFile: jest.fn(path => {
          expect(path).toMatch('testy/mctestface@0.1.0.supr.ast.json');

          return Promise.resolve(
            ok(
              JSON.stringify(
                mockProfileDocumentNode({
                  name: 'mctestface',
                  scope: 'testy',
                  version: {
                    major: 0,
                    minor: 1,
                    patch: 0,
                  },
                })
              )
            )
          );
        }),
      });

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
    });

    it('returns a valid profile when profile is found in registry', async () => {
      mocked(fetchProfileAst).mockResolvedValue(
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
      fileSystem = MockFileSystem({
        path: {
          resolve: (...pathSegments: string[]) => pathSegments.join(''),
        },
        readFile: jest.fn(path => {
          expect(path).toMatch('testy/mctestface@0.1.0.supr.ast.json');

          return Promise.resolve(err(new NotFoundError('test')));
        }),
      });

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
      const mockError = profileFileNotFoundError('../foo.supr.ast.json', 'foo');
      fileSystem = MockFileSystem({
        readFile: () => Promise.resolve(err(mockError)),
      });

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
      ).rejects.toThrow(mockError);
    });

    it('rejects when profile points to a path with .supr extension', async () => {
      fileSystem = MockFileSystem();

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

    it('rejects when profile points to a path with unsupported extension', async () => {
      fileSystem = MockFileSystem();

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
      ).rejects.toThrow(
        unsupportedFileExtensionError(
          mockSuperJson.resolvePath('../foo.ts'),
          EXTENSIONS.profile.build
        )
      );
    });

    it('returns a valid profile when it points to existing path', async () => {
      fileSystem = MockFileSystem({
        readFile: jest.fn(path => {
          expect(path).toMatch('foo.supr.ast.json');

          return Promise.resolve(
            ok(
              JSON.stringify(
                mockProfileDocumentNode({
                  name: 'foo',
                  version: {
                    major: 1,
                    minor: 0,
                    patch: 1,
                    label: 'test',
                  },
                })
              )
            )
          );
        }),
      });

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
      fileSystem = MockFileSystem({
        readFile: () => Promise.resolve(ok(JSON.stringify(invalidAst))),
      });

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
    it('returns a valid profile when profile is found in grid', async () => {
      fileSystem = MockFileSystem({
        path: {
          resolve: (...pathSegments: string[]) => pathSegments.join(''),
        },
        readFile: jest.fn(path => {
          expect(path).toMatch('baz@1.2.3.supr.ast.json');

          return Promise.resolve(
            ok(
              JSON.stringify(
                mockProfileDocumentNode({
                  name: 'baz',
                  version: {
                    major: 1,
                    minor: 2,
                    patch: 3,
                  },
                })
              )
            )
          );
        }),
      });

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
    });

    it('returns a valid profile when profile is found in registry', async () => {
      mocked(fetchProfileAst).mockResolvedValue(
        mockProfileDocumentNode({
          name: 'baz',
          version: {
            major: 1,
            minor: 2,
            patch: 3,
          },
        })
      );
      fileSystem = MockFileSystem({
        path: {
          resolve: (...pathSegments: string[]) => pathSegments.join(''),
        },
        readFile: jest.fn(path => {
          expect(path).toMatch('baz@1.2.3.supr.ast.json');

          return Promise.resolve(err(new NotFoundError('test')));
        }),
      });

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
    it('rejects when profile points to a non-existent path', async () => {
      const mockError = profileFileNotFoundError('../bar.supr.ast.json', 'bar');
      fileSystem = MockFileSystem({
        readFile: () => Promise.resolve(err(mockError)),
      });

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
      ).rejects.toThrow(mockError);
    });

    it('returns a valid profile when it points to existing path', async () => {
      fileSystem = MockFileSystem({
        readFile: jest.fn(path => {
          expect(path).toMatch('bar.supr.ast.json');

          return Promise.resolve(
            ok(
              JSON.stringify(
                mockProfileDocumentNode({
                  name: 'bar',
                  version: {
                    major: 1,
                    minor: 0,
                    patch: 1,
                  },
                })
              )
            )
          );
        }),
      });

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
      fileSystem = MockFileSystem({
        readFile: () => Promise.resolve(ok(JSON.stringify(invalidAst))),
      });

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
