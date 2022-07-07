import { mocked } from 'ts-jest/utils';

import { NotFoundError } from '../../core';
import { fetchProfileAst } from '../../core/registry';
import { err, ok } from '../../lib';
import { MockClient, mockProfileDocumentNode } from '../../mock';
import { getProviderForProfile, SuperJson } from '../../schema-tools';

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

const mockSuperJsonCustomPath = new SuperJson({
  profiles: {
    test: '2.1.0',
  },
  providers: {
    quz: {},
  },
});

afterEach(() => {
  jest.useRealTimers();
  jest.resetAllMocks();
});

jest.mock('../../core/registry');
jest.mock('../../core/events/failure/event-adapter');

describe('superface client', () => {
  describe('getProfile', () => {
    it('rejects when profile does not exists', async () => {
      const client = new MockClient(mockSuperJson);

      await expect(client.getProfile('does/not-exist')).rejects.toThrow(
        'Hint: Profile can be installed using the superface cli tool: `superface install does/not-exist`'
      );
    });

    describe('when using entry with version only', () => {
      it('returns a valid profile when profile is found in grid', async () => {
        const client = new MockClient(mockSuperJson, {
          fileSystemOverride: {
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
          },
        });

        const profile = await client.getProfile('testy/mctestface');
        expect(profile.configuration.version).toBe('0.1.0');
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
        const client = new MockClient(mockSuperJson, {
          fileSystemOverride: {
            readFile: jest.fn(path => {
              expect(path).toMatch('testy/mctestface@0.1.0.supr.ast.json');

              return Promise.resolve(err(new NotFoundError('test')));
            }),
          },
        });

        const profile = await client.getProfile('testy/mctestface');
        expect(profile.configuration.version).toBe('0.1.0');
        expect(fetchProfileAst).toHaveBeenCalledWith(
          'testy/mctestface@0.1.0',
          client.config,
          client.crypto,
          expect.anything(),
          expect.anything()
        );
      });
    });

    describe('when using entry with filepath only', () => {
      it('rejects when profile points to a non-existent path', async () => {
        const mockError = new NotFoundError('test');
        const client = new MockClient(mockSuperJson, {
          fileSystemOverride: {
            readFile: () => Promise.resolve(err(mockError)),
          },
        });

        await expect(client.getProfile('foo')).rejects.toThrow(mockError);
      });

      it('rejects when profile points to a path with .supr extension', async () => {
        const client = new MockClient(mockSuperJson);

        await expect(client.getProfile('evil/foo')).rejects.toThrow(
          new Error('TODO invalid extenstion err -needs to be compiled')
        );
      });

      it('rejects when profile points to a path with unsupported extension', async () => {
        const client = new MockClient(mockSuperJson);

        await expect(client.getProfile('bad/foo')).rejects.toThrow(
          new Error('TODO invalid extenstion err')
        );
      });

      it('returns a valid profile when it points to existing path', async () => {
        const client = new MockClient(mockSuperJson, {
          fileSystemOverride: {
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
          },
        });

        const profile = await client.getProfile('foo');
        expect(profile.configuration.version).toBe('1.0.1-test');
      });

      it('rejects when loaded file is not valid ProfileDocumentNode', async () => {
        const invalidAst: any = mockProfileDocumentNode({ name: 'foo' });
        invalidAst.kind = 'broken';
        const client = new MockClient(mockSuperJson, {
          fileSystemOverride: {
            readFile: () => Promise.resolve(ok(JSON.stringify(invalidAst))),
          },
        });

        await expect(client.getProfile('foo')).rejects.toThrow();
      });
    });

    describe('when using version property', () => {
      it('returns a valid profile when profile is found in grid', async () => {
        const client = new MockClient(mockSuperJson, {
          fileSystemOverride: {
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
          },
        });

        const profile = await client.getProfile('baz');
        expect(profile.configuration.version).toBe('1.2.3');
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
        const client = new MockClient(mockSuperJson, {
          fileSystemOverride: {
            readFile: jest.fn(path => {
              expect(path).toMatch('baz@1.2.3.supr.ast.json');

              return Promise.resolve(err(new NotFoundError('test')));
            }),
          },
        });

        const profile = await client.getProfile('baz');
        expect(profile.configuration.version).toBe('1.2.3');
        expect(fetchProfileAst).toHaveBeenCalledWith(
          'baz@1.2.3',
          client.config,
          client.crypto,
          expect.anything(),
          expect.anything()
        );
      });
    });

    describe('when using file property', () => {
      it('rejects when profile points to a non-existent path', async () => {
        const mockError = new NotFoundError('test');
        const client = new MockClient(mockSuperJson, {
          fileSystemOverride: {
            readFile: () => Promise.resolve(err(mockError)),
          },
        });

        await expect(client.getProfile('bar')).rejects.toThrow(mockError);
      });

      it('returns a valid profile when it points to existing path', async () => {
        const client = new MockClient(mockSuperJson, {
          fileSystemOverride: {
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
          },
        });

        const profile = await client.getProfile('bar');
        expect(profile.configuration.version).toBe('1.0.1');
      });

      it('rejects when loaded file is not valid ProfileDocumentNode', async () => {
        const invalidAst: any = mockProfileDocumentNode({ name: 'bar' });
        invalidAst.kind = 'broken';
        const client = new MockClient(mockSuperJson, {
          fileSystemOverride: {
            readFile: () => Promise.resolve(ok(JSON.stringify(invalidAst))),
          },
        });

        await expect(client.getProfile('bar')).rejects.toThrow();
      });
    });
  });

  describe('getProviderForProfile', () => {
    it('throws when providers are not configured', async () => {
      expect(() =>
        getProviderForProfile(mockSuperJsonCustomPath, 'foo')
      ).toThrow(
        'Profile "foo" needs at least one configured provider for automatic provider selection'
      );
    });

    it('returns a configured provider when present', async () => {
      const provider = getProviderForProfile(mockSuperJson, 'baz');
      expect(provider.configuration.name).toBe('quz');
    });
  });
});
