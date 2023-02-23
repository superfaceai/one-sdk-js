import { EXTENSIONS } from '@superfaceai/ast';

import type { Result } from '../../lib';
import { err, ok } from '../../lib';
import { MockFileSystem, mockMapDocumentNode } from '../../mock';
import { NodeFileSystem } from '../../node';
import { Config } from '../config';
import type { FileSystemError } from '../errors';
import {
  NotFoundError,
  profileIdsDoNotMatchError,
  profileNotFoundError,
  profileProviderNotFoundError,
  providersDoNotMatchError,
  sourceFileExtensionFoundError,
  unsupportedFileExtensionError,
  variantMismatchError,
} from '../errors';
import { resolveMapAst } from './resolve-map-ast';

const mockFileSystem = (
  expectedPath: string,
  result: Result<string, FileSystemError>,
  exists?: boolean
) => {
  const realFileSystem = NodeFileSystem;

  return MockFileSystem({
    exists: () =>
      exists !== undefined ? Promise.resolve(exists) : Promise.resolve(true),
    path: {
      dirname: realFileSystem.path.dirname,
      resolve: realFileSystem.path.resolve,
    },
    readFile: path => {
      if (!path.endsWith(expectedPath)) {
        throw Error('Path does not match');
      }

      return Promise.resolve(result);
    },
  });
};

describe('resolve-map-ast', () => {
  const profileId = 'scope/name';
  const providerName = 'provider';
  const variant = 'variant';
  const config = new Config(NodeFileSystem);
  const ast = mockMapDocumentNode({
    name: 'name',
    scope: 'scope',
    provider: providerName,
    variant,
  });

  it('returns undefined when super.json is not defined', async () => {
    await expect(
      resolveMapAst({
        profileId,
        providerName,
        variant,
        fileSystem: MockFileSystem(),
        superJson: undefined,
        config,
      })
    ).resolves.toBeUndefined();
  });

  it('returns undefined when map is not local', async () => {
    await expect(
      resolveMapAst({
        profileId,
        providerName,
        variant,
        fileSystem: MockFileSystem(),
        superJson: {
          profiles: {
            [profileId]: {
              version: '1.0.0',
              providers: {
                [providerName]: {
                  defaults: {},
                },
              },
              defaults: {},
              priority: [providerName],
            },
          },
          providers: {},
        },
        config,
      })
    ).resolves.toBeUndefined();
  });

  it('throws when profile not defined', async () => {
    await expect(
      resolveMapAst({
        profileId,
        providerName,
        variant,
        fileSystem: MockFileSystem(),
        superJson: {
          profiles: {},
          providers: {},
        },
        config,
      })
    ).rejects.toThrow(profileNotFoundError(profileId));
  });

  it('throws when profile provider not defined', async () => {
    await expect(
      resolveMapAst({
        profileId,
        providerName,
        variant,
        fileSystem: MockFileSystem(),
        superJson: {
          profiles: {
            [profileId]: {
              providers: {},
              version: '1.0.0',
              defaults: {},
              priority: [],
            },
          },
          providers: {},
        },
        config,
      })
    ).rejects.toThrow(profileProviderNotFoundError(profileId, providerName));
  });

  it('throws on unsupported extension', async () => {
    await expect(
      resolveMapAst({
        profileId,
        providerName,
        variant,
        fileSystem: MockFileSystem(),
        superJson: {
          profiles: {
            [profileId]: {
              version: '1.0.0',
              providers: {
                [providerName]: {
                  file: 'path/to.json',
                  defaults: {},
                },
              },
              defaults: {},
              priority: [providerName],
            },
          },
          providers: {},
        },
        config,
      })
    ).rejects.toThrow(
      unsupportedFileExtensionError('path/to.json', EXTENSIONS.map.source)
    );
  });

  it('throws when map is not compiled', async () => {
    await expect(
      resolveMapAst({
        profileId,
        providerName,
        variant,
        fileSystem: MockFileSystem({ exists: () => Promise.resolve(false) }),
        superJson: {
          profiles: {
            [profileId]: {
              version: '1.0.0',
              providers: {
                [providerName]: {
                  file: `path/to${EXTENSIONS.map.source}`,
                  defaults: {},
                },
              },
              defaults: {},
              priority: [providerName],
            },
          },
          providers: {},
        },
        config,
      })
    ).rejects.toThrow(sourceFileExtensionFoundError(EXTENSIONS.map.source));
  });

  it('throws when map ast is not found', async () => {
    await expect(
      resolveMapAst({
        profileId,
        providerName,
        variant,
        fileSystem: mockFileSystem(
          `path/to${EXTENSIONS.map.build}`,
          err(new NotFoundError('test'))
        ),
        superJson: {
          profiles: {
            [profileId]: {
              version: '1.0.0',
              providers: {
                [providerName]: {
                  file: `path/to${EXTENSIONS.map.source}`,
                  defaults: {},
                },
              },
              defaults: {},
              priority: [providerName],
            },
          },
          providers: {},
        },
        config,
      })
    ).rejects.toThrow('File referenced in super.json not found');
  });

  it('throws on variant mismatch', async () => {
    await expect(
      resolveMapAst({
        profileId,
        providerName,
        variant: 'different',
        fileSystem: mockFileSystem(
          `path/to${EXTENSIONS.map.build}`,
          ok(JSON.stringify(ast))
        ),
        superJson: {
          profiles: {
            [profileId]: {
              version: '1.0.0',
              providers: {
                [providerName]: {
                  file: `path/to${EXTENSIONS.map.source}`,
                  defaults: {},
                },
              },
              defaults: {},
              priority: [providerName],
            },
          },
          providers: {},
        },
        config,
      })
    ).rejects.toThrow(variantMismatchError('variant', 'different'));
  });

  it('throws when profile ids does not match - scope is different', async () => {
    await expect(
      resolveMapAst({
        profileId: 'different-scope/test',
        providerName,
        variant,
        fileSystem: mockFileSystem(
          `path/to${EXTENSIONS.map.build}`,
          ok(
            JSON.stringify(
              mockMapDocumentNode({
                name: 'name',
                provider: providerName,
                variant,
              })
            )
          )
        ),
        superJson: {
          profiles: {
            ['different-scope/test']: {
              version: '1.0.0',
              providers: {
                [providerName]: {
                  file: `path/to${EXTENSIONS.map.source}`,
                  defaults: {},
                },
              },
              defaults: {},
              priority: [providerName],
            },
          },
          providers: {},
        },
        config,
      })
    ).rejects.toThrow(
      profileIdsDoNotMatchError('name', 'different-scope/test')
    );
  });

  it('throws when profile ids does not match - name is different', async () => {
    await expect(
      resolveMapAst({
        profileId: 'scope/different',
        providerName,
        variant,
        fileSystem: mockFileSystem(
          `path/to${EXTENSIONS.map.build}`,
          ok(JSON.stringify(ast))
        ),
        superJson: {
          profiles: {
            ['scope/different']: {
              version: '1.0.0',
              providers: {
                [providerName]: {
                  file: `path/to${EXTENSIONS.map.source}`,
                  defaults: {},
                },
              },
              defaults: {},
              priority: [providerName],
            },
          },
          providers: {},
        },
        config,
      })
    ).rejects.toThrow(
      profileIdsDoNotMatchError('scope/name', 'scope/different')
    );
  });

  it('throws when provider names does not match', async () => {
    await expect(
      resolveMapAst({
        profileId,
        providerName: 'different',
        variant,
        fileSystem: mockFileSystem(
          `path/to${EXTENSIONS.map.build}`,
          ok(JSON.stringify(ast))
        ),
        superJson: {
          profiles: {
            [profileId]: {
              version: '1.0.0',
              providers: {
                ['different']: {
                  file: `path/to${EXTENSIONS.map.source}`,
                  defaults: {},
                },
              },
              defaults: {},
              priority: ['different'],
            },
          },
          providers: {},
        },
        config,
      })
    ).rejects.toThrow(providersDoNotMatchError('provider', 'different', 'map'));
  });

  it('returns map ast when path to source is passed', async () => {
    await expect(
      resolveMapAst({
        profileId,
        providerName,
        variant,
        fileSystem: mockFileSystem(
          `path/to${EXTENSIONS.map.build}`,
          ok(JSON.stringify(ast))
        ),
        superJson: {
          profiles: {
            [profileId]: {
              version: '1.0.0',
              providers: {
                [providerName]: {
                  file: `path/to${EXTENSIONS.map.source}`,
                  defaults: {},
                },
              },
              defaults: {},
              priority: [providerName],
            },
          },
          providers: {},
        },
        config,
      })
    ).resolves.toEqual(ast);
  });

  it('returns map ast when path to ast is passed', async () => {
    await expect(
      resolveMapAst({
        profileId,
        providerName,
        variant,
        fileSystem: mockFileSystem(
          `path/to${EXTENSIONS.map.build}`,
          ok(JSON.stringify(ast))
        ),
        superJson: {
          profiles: {
            [profileId]: {
              version: '1.0.0',
              providers: {
                [providerName]: {
                  file: `path/to${EXTENSIONS.map.build}`,
                  defaults: {},
                },
              },
              defaults: {},
              priority: [providerName],
            },
          },
          providers: {},
        },
        config,
      })
    ).resolves.toEqual(ast);
  });
});
