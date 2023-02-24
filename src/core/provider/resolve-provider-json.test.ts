import type { NormalizedSuperJsonDocument } from '@superfaceai/ast';

import type { IFileSystemError } from '../../interfaces';
import type { Result } from '../../lib';
import { err, ok } from '../../lib';
import { MockFileSystem, mockProviderJson } from '../../mock';
import { NodeFileSystem } from '../../node';
import { Config } from '../config';
import {
  NotFoundError,
  providersDoNotMatchError,
  unconfiguredProviderError,
} from '../errors';
import { resolveProviderJson } from './resolve-provider-json';

const mockFileSystem = (
  expectedPath: string,
  result: Result<string, IFileSystemError>
) => {
  const realFileSystem = NodeFileSystem;

  return MockFileSystem({
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

describe('resolve-provider-json', () => {
  const providerName = 'provider';
  const config = new Config(NodeFileSystem);
  const providerJson = mockProviderJson({ name: providerName });

  it('returns undefined when super.json is not defined', async () => {
    await expect(
      resolveProviderJson({
        providerName,
        fileSystem: MockFileSystem(),
        superJson: undefined,
        config,
      })
    ).resolves.toBeUndefined();
  });

  it('returns undefined when provider is not local', async () => {
    await expect(
      resolveProviderJson({
        providerName,
        fileSystem: MockFileSystem(),
        superJson: {
          profiles: {},
          providers: {
            [providerName]: {
              security: [],
              parameters: {},
            },
          },
        },
        config,
      })
    ).resolves.toBeUndefined();
  });

  it('throws when provider is not configured', async () => {
    await expect(
      resolveProviderJson({
        providerName,
        fileSystem: MockFileSystem(),
        superJson: {
          profiles: {},
          providers: {},
        },
        config,
      })
    ).rejects.toThrow(unconfiguredProviderError(providerName));
  });

  it('throws when file is not found', async () => {
    await expect(
      resolveProviderJson({
        providerName,
        fileSystem: mockFileSystem('path.json', err(new NotFoundError('test'))),
        superJson: {
          profiles: {},
          providers: {
            [providerName]: {
              file: 'path.json',
              security: [],
              parameters: {},
            },
          },
        },
        config,
      })
    ).rejects.toThrow('File referenced in super.json not found');
  });

  it('throws when provider name does not match', async () => {
    await expect(
      resolveProviderJson({
        providerName,
        fileSystem: mockFileSystem(
          'path.json',
          ok(JSON.stringify(mockProviderJson({ name: 'different' })))
        ),
        superJson: {
          profiles: {},
          providers: {
            [providerName]: {
              file: 'path.json',
              security: [],
              parameters: {},
            },
          },
        },
        config,
      })
    ).rejects.toThrow(
      providersDoNotMatchError('different', providerName, 'provider.json')
    );
  });

  it('returns provider json', async () => {
    await expect(
      resolveProviderJson({
        providerName,
        fileSystem: mockFileSystem(
          'path.json',
          ok(JSON.stringify(providerJson))
        ),
        superJson: {
          profiles: {},
          providers: {
            [providerName]: {
              file: 'path.json',
              security: [],
              parameters: {},
            },
          },
        },
        config,
      })
    ).resolves.toEqual(providerJson);
  });

  describe('when using ast property', () => {
    it('prefers content in ast property over file property', async () => {
      await expect(
        resolveProviderJson({
          providerName,
          fileSystem: mockFileSystem(
            'path.json',
            ok(JSON.stringify(mockProviderJson({ name: 'file_provider' })))
          ),
          superJson: {
            profiles: {},
            providers: {
              [providerName]: {
                file: 'path.json',
                ast: providerJson,
              },
            },
          } as unknown as NormalizedSuperJsonDocument,
          config,
        })
      ).resolves.toEqual(providerJson);
    });

    it('returns provider json when passed as string', async () => {
      await expect(
        resolveProviderJson({
          providerName,
          fileSystem: mockFileSystem(
            'path.json',
            err(new NotFoundError('test'))
          ),
          superJson: {
            profiles: {},
            providers: {
              [providerName]: {
                ast: JSON.stringify(providerJson),
              },
            },
          } as unknown as NormalizedSuperJsonDocument,
          config,
        })
      ).resolves.toEqual(providerJson);
    });

    it('returns provider json when passed as object', async () => {
      await expect(
        resolveProviderJson({
          providerName,
          fileSystem: mockFileSystem(
            'path.json',
            err(new NotFoundError('test'))
          ),
          superJson: {
            profiles: {},
            providers: {
              [providerName]: {
                ast: providerJson,
              },
            },
          } as unknown as NormalizedSuperJsonDocument,
          config,
        })
      ).resolves.toEqual(providerJson);
    });
  });
});
