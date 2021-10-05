import {
  BackoffKind,
  isApiKeySecurityValues,
  isBasicAuthSecurityValues,
  isBearerTokenSecurityValues,
  isDigestSecurityValues,
  isFileURIString,
  isVersionString,
  NormalizedUsecaseDefaults,
  OnFail,
  ProfileProviderEntry,
  SecurityValues,
} from '@superfaceai/ast';
import { promises as fsp, readFileSync, statSync } from 'fs';
import { relative as relativePath, resolve as resolvePath } from 'path';
import { mocked } from 'ts-jest/utils';

import { isAccessible } from '../../lib/io';
import { ok } from '../../lib/result/result';
import { mergeSecurity } from './mutate';
import * as normalize from './normalize';
import { composeFileURI, trimFileURI } from './schema';
import { SuperJson } from './superjson';

//Mock fs
jest.mock('fs', () => ({
  ...jest.requireActual<Record<string, unknown>>('fs'),
  statSync: jest.fn(),
  readFileSync: jest.fn(),
  promises: {
    readFile: jest.fn(),
    stat: jest.fn(),
  },
}));
//Mock path
jest.mock('path', () => ({
  ...jest.requireActual<Record<string, unknown>>('path'),
  resolve: jest.fn(),
  relative: jest.fn(),
  join: jest.fn(),
}));

//Mock io
jest.mock('../../lib/io', () => ({
  ...jest.requireActual<Record<string, unknown>>('../../lib/io'),
  isAccessible: jest.fn(),
}));

describe('SuperJson', () => {
  let superjson: SuperJson;

  const mockStats = {
    isFile: () => true,
    isDirectory: () => true,
    isBlockDevice: () => true,
    isCharacterDevice: () => true,
    isSymbolicLink: () => true,
    isFIFO: () => true,
    isSocket: () => true,
    dev: 1,
    ino: 1,
    mode: 1,
    nlink: 1,
    uid: 1,
    gid: 1,
    rdev: 1,
    size: 1,
    blksize: 1,
    blocks: 1,
    atimeMs: 1,
    mtimeMs: 1,
    ctimeMs: 1,
    birthtimeMs: 1,
    atime: new Date(),
    mtime: new Date(),
    ctime: new Date(),
    birthtime: new Date(),
  };

  const mockSuperJsonDocument = {
    profiles: {
      test: {
        defaults: { input: { input: { test: 'test' } } },
        file: 'some/path',
        providers: {},
      },
    },
  };

  beforeEach(() => {
    superjson = new SuperJson({});
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('when checking if input is ApiKeySecurityValues', () => {
    it('checks api values input correctly', () => {
      const mockInput = {
        id: 'id',
        apikey: 'key',
      };
      expect(isApiKeySecurityValues(mockInput)).toEqual(true);
    });

    it('checks unknow input correctly', () => {
      const mockInput = {
        id: 'id',
        digest: 'digest',
      };
      expect(isApiKeySecurityValues(mockInput)).toEqual(false);
    });
  });

  describe('when checking if input is BasicAuthSecurityValues', () => {
    it('checks basic auth values input correctly', () => {
      const mockInput = {
        id: 'id',
        username: 'username',
        password: 'password',
      };
      expect(isBasicAuthSecurityValues(mockInput)).toEqual(true);
    });

    it('checks unknow input correctly', () => {
      const mockInput = {
        id: 'id',
        digest: 'digest',
      };
      expect(isBasicAuthSecurityValues(mockInput)).toEqual(false);
    });
  });

  describe('when checking if input is BearerTokenSecurityValues', () => {
    it('checks bearer values input correctly', () => {
      const mockInput = {
        id: 'id',
        token: 'token',
      };
      expect(isBearerTokenSecurityValues(mockInput)).toEqual(true);
    });

    it('checks unknow input correctly', () => {
      const mockInput = {
        id: 'id',
        digest: 'digest',
      };
      expect(isBearerTokenSecurityValues(mockInput)).toEqual(false);
    });
  });

  describe('when checking if input is DigestSecurityValues', () => {
    it('checks digest values input correctly', () => {
      const mockInput = {
        id: 'id',
        digest: 'digest',
      };
      expect(isDigestSecurityValues(mockInput)).toEqual(true);
    });

    it('checks unknow input correctly', () => {
      const mockInput = {
        id: 'id',
        token: 'token',
      };
      expect(isDigestSecurityValues(mockInput)).toEqual(false);
    });
  });

  describe('when getting stringified version of super.json', () => {
    it('returns correct string', () => {
      const mockSuperJsonDocument = {
        profiles: {
          test: {
            defaults: { input: { input: { test: 'test' } } },
            file: 'some/path',
            providers: {},
          },
        },
      };
      const superJson = new SuperJson(mockSuperJsonDocument);
      expect(superJson.stringified).toEqual(
        JSON.stringify(mockSuperJsonDocument, undefined, 2)
      );
    });

    it('checks unknow input correctly', () => {
      const mockInput = {
        id: 'id',
        token: 'token',
      };
      expect(isDigestSecurityValues(mockInput)).toEqual(false);
    });
  });

  describe('when loading super.json synchronously', () => {
    const mockError = new Error('test');

    it('returns err when unable to find super.json', () => {
      mocked(statSync).mockImplementation(() => {
        throw mockError;
      });
      const result = SuperJson.loadSync('test');
      expect(result.isErr()).toBe(true);
      expect(result.isErr() && result.error.message).toMatch(
        'super.json not found in "test"\nError: test'
      );
    });

    it('returns err when super.json is not file', () => {
      mocked(statSync).mockReturnValue({ ...mockStats, isFile: () => false });
      const result = SuperJson.loadSync('test');
      expect(result.isErr()).toBe(true);
      expect(result.isErr() && result.error.message).toMatch(
        '"test" is not a file'
      );
    });

    it('returns err when unable to read super.json', () => {
      mocked(statSync).mockReturnValue(mockStats);
      mocked(readFileSync).mockImplementation(() => {
        throw mockError;
      });
      const result = SuperJson.loadSync('test');
      expect(result.isErr()).toBe(true);
      expect(result.isErr() && result.error.message).toMatch(
        'Unable to read super.json\n\nError: test'
      );
    });

    it('returns err when there is an error during parsing super.json', () => {
      mocked(statSync).mockReturnValue(mockStats);
      mocked(readFileSync).mockReturnValue(`{
        "profiles": {
          "send-message": {
            "version": "1.0.Z",
            "providers": {
              "acme": {
                "mapVariant": "my-bugfix",
                "mapRevision": "1113"
              }
            }
          }
        },
        "providers": {
          "acme": {
            "security": [
              {
                "id": "myApiKey",
                "apikey": "SECRET"
              }
            ]
          }
        }
      }`);
      expect(SuperJson.loadSync('test').isErr()).toEqual(true);
    });

    // TODO: Skipped for now, broken because of typescript-is bug
    // https://github.com/woutervh-/typescript-is/issues/111
    it.skip('returns err when there is an error during parsing super.json - usecase not nested under defaults', () => {
      mocked(statSync).mockReturnValue(mockStats);
      mocked(readFileSync).mockReturnValue(`{
        "profiles": {
          "send-message": {
            "version": "1.0.0",
            "providers": {
              "acme": {
                "RetrieveCharacterInformation": {
                  "retryPolicy": "circuit-breaker"
                },
                "mapVariant": "my-bugfix",
                "mapRevision": "1113"
              }
            }
          }
        },
        "providers": {
          "acme": {
            "security": [
              {
                "id": "myApiKey",
                "apikey": "SECRET"
              }
            ]
          }
        }
      }`);
      expect(SuperJson.loadSync('test').isErr()).toEqual(true);
    });

    it('returns new super.json', () => {
      mocked(statSync).mockReturnValue(mockStats);
      mocked(readFileSync).mockReturnValue(
        JSON.stringify(mockSuperJsonDocument)
      );

      expect(SuperJson.loadSync('test')).toEqual(
        ok(new SuperJson(mockSuperJsonDocument, 'test'))
      );
    });
  });

  describe('when loading super.json asynchronously', () => {
    const mockError = new Error('test');

    it('returns err when unable to find super.json', async () => {
      jest.spyOn(fsp, 'stat').mockRejectedValue(mockError);
      const result = await SuperJson.load('test');
      expect(result.isErr()).toBe(true);
      expect(result.isErr() && result.error.message).toMatch(
        'super.json not found in "test"'
      );
    });

    it('returns err when super.json is not file', async () => {
      jest
        .spyOn(fsp, 'stat')
        .mockResolvedValue({ ...mockStats, isFile: () => false });
      const result = await SuperJson.load('test');
      expect(result.isErr()).toBe(true);
      expect(result.isErr() && result.error.message).toMatch(
        '"test" is not a file'
      );
    });

    it('returns err when unable to read super.json', async () => {
      jest.spyOn(fsp, 'stat').mockResolvedValue(mockStats);
      jest.spyOn(fsp, 'readFile').mockRejectedValue(mockError);
      const result = await SuperJson.load('test');
      expect(result.isErr()).toBe(true);
      expect(result.isErr() && result.error.message).toMatch(
        'Unable to read super.json'
      );
    });

    it('returns err when there is an error during parsing super.json', async () => {
      jest.spyOn(fsp, 'stat').mockResolvedValue(mockStats);
      jest.spyOn(fsp, 'readFile').mockResolvedValue(`{
        "profiles": {
          "send-message": {
            "version": "1.0.Z",
            "providers": {
              "acme": {
                "mapVariant": "my-bugfix",
                "mapRevision": "1113"
              }
            }
          }
        },
        "providers": {
          "acme": {
            "security": [
              {
                "id": "myApiKey",
                "apikey": "SECRET"
              }
            ]
          }
        }
      }`);
      expect((await SuperJson.load('test')).isErr()).toEqual(true);
    });

    it('returns new super.json', async () => {
      jest.spyOn(fsp, 'stat').mockResolvedValue(mockStats);
      jest
        .spyOn(fsp, 'readFile')
        .mockResolvedValue(JSON.stringify(mockSuperJsonDocument));

      await expect(SuperJson.load('test')).resolves.toEqual(
        ok(new SuperJson(mockSuperJsonDocument, 'test'))
      );
    });
  });

  describe('when normalizing profile provider settings', () => {
    it('returns correct object when entry is undefined', async () => {
      const mockProfileProviderEntry = undefined;
      const mockDefaults: NormalizedUsecaseDefaults = {};

      expect(
        normalize.normalizeProfileProviderSettings(
          mockProfileProviderEntry,
          mockDefaults
        )
      ).toEqual({
        defaults: {},
      });
    });

    it('returns correct object when entry is uri', async () => {
      const mockProfileProviderEntry = 'file://some/path';
      const mockDefaults: NormalizedUsecaseDefaults = {};

      expect(
        normalize.normalizeProfileProviderSettings(
          mockProfileProviderEntry,
          mockDefaults
        )
      ).toEqual({
        file: 'some/path',
        defaults: {},
      });
    });

    it('throws error when entry is invalid uri', async () => {
      const mockProfileProviderEntry = 'some/path';
      const mockDefaults: NormalizedUsecaseDefaults = {};

      expect(() =>
        normalize.normalizeProfileProviderSettings(
          mockProfileProviderEntry,
          mockDefaults
        )
      ).toThrowError(
        new RegExp(
          `Invalid profile provider entry format\n\nSettings: ${mockProfileProviderEntry}`
        )
      );
    });

    it('returns correct object when entry contains file', async () => {
      const mockProfileProviderEntry: ProfileProviderEntry = {
        defaults: {},
        file: 'some/file/path',
      };
      const mockDefaults: NormalizedUsecaseDefaults = {};

      expect(
        normalize.normalizeProfileProviderSettings(
          mockProfileProviderEntry,
          mockDefaults
        )
      ).toEqual({
        file: 'some/file/path',
        defaults: {},
      });
    });

    it('returns correct object when entry contains map variant a revision', async () => {
      const mockProfileProviderEntry: ProfileProviderEntry = {
        defaults: {},
        mapRevision: 'test',
        mapVariant: 'test',
      };
      const mockDefaults: NormalizedUsecaseDefaults = {};

      expect(
        normalize.normalizeProfileProviderSettings(
          mockProfileProviderEntry,
          mockDefaults
        )
      ).toEqual({
        mapRevision: 'test',
        mapVariant: 'test',
        defaults: {},
      });
    });
  });

  describe('when normalizing profile settings', () => {
    it('returns correct object when entry is uri', async () => {
      const mockProfileEntry = 'file://some/path';

      expect(normalize.normalizeProfileSettings(mockProfileEntry, [])).toEqual({
        file: 'some/path',
        priority: [],
        defaults: {},
        providers: {},
      });
    });

    it('returns correct object when entry is version', async () => {
      const mockProfileEntry = '1.0.0';

      expect(normalize.normalizeProfileSettings(mockProfileEntry, [])).toEqual({
        version: '1.0.0',
        priority: [],
        defaults: {},
        providers: {},
      });
    });

    it('throws error when entry is unknown string', async () => {
      const mockProfileEntry = 'madeup';
      expect(() =>
        normalize.normalizeProfileSettings(mockProfileEntry, [])
      ).toThrowError(
        new Error('Invalid profile entry format: ' + mockProfileEntry)
      );
    });

    it('returns correct object when entry contains file', async () => {
      const mockProfileEntry = {
        file: 'some/path',
      };

      expect(normalize.normalizeProfileSettings(mockProfileEntry, [])).toEqual({
        file: 'some/path',
        priority: [],
        defaults: {},
        providers: {},
      });
    });
  });

  describe('when normalizing provider settings', () => {
    it('returns correct object when entry is uri', async () => {
      const mockProviderEntry = 'file://some/path';

      expect(normalize.normalizeProviderSettings(mockProviderEntry)).toEqual({
        file: 'some/path',
        security: [],
      });
    });

    it('throws error when entry is unknown string', async () => {
      const mockProviderEntry = 'madeup';
      expect(() =>
        normalize.normalizeProviderSettings(mockProviderEntry)
      ).toThrowError(
        new RegExp('Invalid provider entry format: ' + mockProviderEntry)
      );
    });

    it('returns correct object when entry is a object', async () => {
      const mockProviderEntry = {
        file: 'some/path',
        security: [],
      };

      expect(normalize.normalizeProviderSettings(mockProviderEntry)).toEqual({
        file: 'some/path',
        security: [],
      });
    });
  });

  describe('when getting normalized super.json', () => {
    it('returns correct object when cache is undefined', async () => {
      const mockSuperJson = new SuperJson({
        providers: {
          test: {},
        },
        profiles: {
          profile: {
            file: 'some/path',
            defaults: {},
          },
        },
      });

      expect(mockSuperJson.normalized).toEqual({
        providers: {
          test: {
            file: undefined,
            security: [],
          },
        },
        profiles: {
          profile: {
            priority: ['test'],
            file: 'some/path',
            defaults: {},
            providers: {},
          },
        },
      });
    });

    it('returns correct object when cache is defined', async () => {
      const mockSuperJson = new SuperJson({
        providers: {
          test: {},
        },
        profiles: {
          profile: {
            file: 'some/path',
            defaults: {},
          },
        },
      });

      expect(mockSuperJson.normalized).toEqual({
        providers: {
          test: {
            file: undefined,
            security: [],
          },
        },
        profiles: {
          profile: {
            file: 'some/path',
            priority: ['test'],
            defaults: {},
            providers: {},
          },
        },
      });

      const normalizeProfileSettingsSpy = jest.spyOn(
        normalize,
        'normalizeProfileSettings'
      );
      expect(mockSuperJson.normalized).toEqual({
        providers: {
          test: {
            file: undefined,
            security: [],
          },
        },
        profiles: {
          profile: {
            priority: ['test'],
            file: 'some/path',
            defaults: {},
            providers: {},
          },
        },
      });

      expect(normalizeProfileSettingsSpy).toHaveBeenCalledTimes(0);
      normalizeProfileSettingsSpy.mockRestore();
    });
  });

  describe('when checking version string validity', () => {
    it('checks version string validity', () => {
      expect(isVersionString('1.0.0')).toBe(true);
      expect(isVersionString('0.0.0')).toBe(true);
      expect(isVersionString('1.0')).toBe(false);
      expect(isVersionString('1')).toBe(false);
      expect(isVersionString('^1.0.0')).toBe(false);
      expect(isVersionString('hippopotamus')).toBe(false);
    });
  });
  describe('when checking file URI string validity', () => {
    it('checks file URI string validity', () => {
      expect(isFileURIString('file://../superface.suma')).toBe(true);
      expect(isFileURIString('file:///superface.suma')).toBe(true);
      expect(isFileURIString('file://superface.suma')).toBe(true);
      expect(isFileURIString('a banana daiquiri')).toBe(false);
    });
  });

  describe('when triming file uri', () => {
    it('return path without file://', () => {
      expect(trimFileURI('file://test/path/to/super.json')).toEqual(
        'test/path/to/super.json'
      );
    });
  });

  describe('when composing file uri', () => {
    it('return path without change', () => {
      expect(composeFileURI('file://test/path/to/super.json')).toEqual(
        'file://test/path/to/super.json'
      );
    });

    it('return path with file://../', () => {
      expect(composeFileURI('../test/path/to/super.json')).toEqual(
        'file://../test/path/to/super.json'
      );
    });

    it('return path with file://', () => {
      expect(composeFileURI('test/path/to/super.json')).toEqual(
        'file://./test/path/to/super.json'
      );
    });
  });

  describe('when parsing super.json', () => {
    it('parses valid super.json', () => {
      const superJson = `{
        "profiles": {
          "send-message": {
            "version": "1.0.0",
            "providers": {
              "acme": {
                "mapVariant": "my-bugfix",
                "mapRevision": "1113"
              }
            }
          }
        },
        "providers": {
          "acme": {
            "security": [
              {
                "id": "myApiKey",
                "apikey": "SECRET"
              }
            ]
          }
        }
      }`;
      expect(SuperJson.parse(JSON.parse(superJson)).isOk()).toBe(true);
    });

    it('parses valid super.json with multiple profiles', () => {
      const superJson = `{
        "profiles": {
          "acme/deliver-crate": "1.2.3",
          "superfaceai/send-sms": {
            "version": "1.4.0"
          },
          "starwars/character-information": {
            "version": "1.1.0",
            "providers": {
              "swapidev": {
                "mapVariant": "default",
                "mapRevision": "123",
                "defaults": {
                  "GetInfo": {
                    "input": {
                      "characterName": "Luke"
                    }
                  }
                }
              },
              "swapiprod": {}
            },
            "defaults": {
              "GetInfo": {
                "input": {
                  "onlyOldSeries": true
                }
              }
            }
          }
        },
        "providers": {
          "swapidev": {
            "security": [
              {
                "id": "myBasicAuth",
                "username": "johndoe",
                "password": "$SF_SWAPIDEW_BASICAUTH_PASSWORD"
              },
              {
                "id": "myApiKey",
                "apikey": "SECRET"
              },
              {
                "id": "myCustomScheme",
                "digest": "SECRET"
              }
            ]
          },
          "twillio": {
            "security": []
          }
        }
      }`;
      expect(SuperJson.parse(JSON.parse(superJson)).isOk()).toBe(true);
    });

    it('returns error on document with invalid profile provider', () => {
      const superJson = `{
        "profiles": {
          "send-message": {
            "version": "1.0.Z",
            "providers": {
              "acme": {
                "mapVariant": "my-bugfix",
                "mapRevision": "1113"
              }
            }
          }
        },
        "providers": {
          "acme": {
            "security": [
              {
                "id": "myApiKey",
                "apikey": "SECRET"
              }
            ]
          }
        }
      }`;
      expect(SuperJson.parse(JSON.parse(superJson)).isErr()).toBe(true);
    });

    it('returns error on document with invalid security', () => {
      const superJson = `{
        "profiles": {
          "send-message": {
            "version": "1.0.X",
            "providers": {
              "acme": {
                "mapVariant": "my-bugfix",
                "mapRevision": "1113"
              }
            }
          }
        },
        "providers": {
          "acme": {
            "security": [
              {
                "id": "myApiKey",
                "apikey": "SECRET",
                "username": "username"
              },
              {
                "id": "myDigest",
                "digest": "SECRET"
              }
            ]
          }
        }
      }`;
      expect(SuperJson.parse(JSON.parse(superJson)).isErr()).toBe(true);
    });

    it('returns error invalid document', () => {
      const superJson = `"hello"`;
      expect(SuperJson.parse(JSON.parse(superJson)).isErr()).toBe(true);
    });
  });

  describe('when normalizing super.json', () => {
    it('normalizes super.json correctly', () => {
      const superJson = `{
        "profiles": {
          "a": "file://a.supr",
          "b": "0.1.0",
          "x/a": {
            "file": "x/a.supr"
          }, 
          "x/b": {
            "version": "0.2.1",
            "priority": [],
            "defaults": {
              "Test": {}
            }
          },
          "y/a": {
            "version": "1.2.3",
            "priority": [],
            "providers": {
              "foo": "file://y/a.suma",
              "baz": {
                "mapVariant": "bugfix"
              }
            }
          },
          "y/b": {
            "version": "1.2.3",
            "priority": ["foo", "bar"],
            "defaults": {
              "Usecase": {
                "providerFailover": true,
                "input": {
                  "a": 1,
                  "b": {
                    "x": 1,
                    "y": true
                  }
                }
              }
            },
            "providers": {
              "foo": {
                "defaults": {
                  "Usecase": {
                    "input": {},
                    "retryPolicy": "none"
                  }
                }
              },
              "bar": {
                "defaults": {
                  "Usecase": {
                    "retryPolicy": {
                      "kind": "circuit-breaker",
                      "maxContiguousRetries": 5,
                      "backoff": "exponential"
                    },
                    "input": {
                      "a": 12,
                      "b": {
                        "x": {}
                      },
                      "c": {
                        "hello": 17
                      }
                    }
                  }
                }
              }
            }
          },
          "y/c": {
            "version": "1.2.4",
            "priority": ["foo", "bar"],
            "defaults": {
              "Usecase": {
                "providerFailover": false,
                "input": {
                  "a": 1,
                  "b": {
                    "x": 1,
                    "y": true
                  }
                }
              }
            },
            "providers": {
              "foo": {
                "defaults": {
                  "Usecase": {
                    "input": {},
                    "retryPolicy": "circuit-breaker"
                  }
                }
              },
              "bar": {
                "defaults": {
                  "Usecase": {
                    "retryPolicy": {
                      "kind": "none"
                    },
                    "input": {
                      "a": 12,
                      "b": {
                        "x": {}
                      },
                      "c": {
                        "hello": 17
                      }
                    }
                  }
                }
              },
              "zoo": {
                "defaults": {
                  "Usecase": {
                    "retryPolicy": {
                      "kind": "circuit-breaker",
                      "maxContiguousRetries": 5,
                      "backoff": {
                        "kind": "exponential",
                        "start": 5
                      }
                    },
                    "input": {
                      "a": 12,
                      "b": {
                        "x": {}
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "providers": {
          "foo": "file:///foo.provider.json",
          "bar": {
            "file": "./bar.provider.json",
            "security": []
          },
          "baz": {
            "security": [
              {
                "id": "myBasicAuth",
                "username": "hi",
                "password": "heya"
              }
            ]
          }
        }
      }`;

      const doc = new SuperJson(
        SuperJson.parse(JSON.parse(superJson)).unwrap()
      );
      expect(doc.normalized).toStrictEqual({
        profiles: {
          a: {
            defaults: {},
            priority: ['foo', 'bar', 'baz'],
            providers: {},
            file: 'a.supr',
          },
          b: {
            defaults: {},
            priority: ['foo', 'bar', 'baz'],
            providers: {},
            version: '0.1.0',
          },
          'x/a': {
            defaults: {},
            priority: ['foo', 'bar', 'baz'],
            providers: {},
            file: 'x/a.supr',
          },
          'x/b': {
            defaults: {
              Test: {
                input: {},
                providerFailover: false,
              },
            },
            priority: ['foo', 'bar', 'baz'],
            providers: {},
            version: '0.2.1',
          },
          'y/a': {
            defaults: {},
            priority: ['foo', 'baz'],
            providers: {
              foo: {
                file: 'y/a.suma',
                defaults: {},
              },
              baz: {
                mapVariant: 'bugfix',
                mapRevision: undefined,
                defaults: {},
              },
            },
            version: '1.2.3',
          },
          'y/b': {
            defaults: {
              Usecase: {
                input: {
                  a: 1,
                  b: {
                    x: 1,
                    y: true,
                  },
                },
                providerFailover: true,
              },
            },
            priority: ['foo', 'bar'],
            providers: {
              foo: {
                defaults: {
                  Usecase: {
                    input: {
                      a: 1,
                      b: {
                        x: 1,
                        y: true,
                      },
                    },
                    retryPolicy: {
                      kind: OnFail.NONE,
                    },
                  },
                },
                mapVariant: undefined,
                mapRevision: undefined,
              },
              bar: {
                defaults: {
                  Usecase: {
                    input: {
                      a: 12,
                      b: {
                        x: {},
                        y: true,
                      },
                      c: {
                        hello: 17,
                      },
                    },
                    retryPolicy: {
                      kind: OnFail.CIRCUIT_BREAKER,
                      maxContiguousRetries: 5,
                      backoff: {
                        kind: BackoffKind.EXPONENTIAL,
                      },
                    },
                  },
                },
                mapVariant: undefined,
                mapRevision: undefined,
              },
            },
            version: '1.2.3',
          },
          'y/c': {
            defaults: {
              Usecase: {
                input: {
                  a: 1,
                  b: {
                    x: 1,
                    y: true,
                  },
                },
                providerFailover: false,
              },
            },
            priority: ['foo', 'bar'],
            providers: {
              foo: {
                defaults: {
                  Usecase: {
                    input: {
                      a: 1,
                      b: {
                        x: 1,
                        y: true,
                      },
                    },
                    retryPolicy: {
                      kind: 'circuit-breaker',
                    },
                  },
                },
                mapVariant: undefined,
                mapRevision: undefined,
              },
              bar: {
                defaults: {
                  Usecase: {
                    input: {
                      a: 12,
                      b: {
                        x: {},
                        y: true,
                      },
                      c: {
                        hello: 17,
                      },
                    },
                    retryPolicy: {
                      kind: 'none',
                    },
                  },
                },
                mapVariant: undefined,
                mapRevision: undefined,
              },
              zoo: {
                defaults: {
                  Usecase: {
                    input: {
                      a: 12,
                      b: {
                        x: {},
                        y: true,
                      },
                    },
                    retryPolicy: {
                      kind: 'circuit-breaker',
                      maxContiguousRetries: 5,
                      backoff: {
                        kind: 'exponential',
                        start: 5,
                      },
                    },
                  },
                },
                mapVariant: undefined,
                mapRevision: undefined,
              },
            },
            version: '1.2.4',
          },
        },
        providers: {
          foo: {
            file: '/foo.provider.json',
            security: [],
          },
          bar: {
            file: './bar.provider.json',
            security: [],
          },
          baz: {
            file: undefined,
            security: [
              {
                id: 'myBasicAuth',
                username: 'hi',
                password: 'heya',
              },
            ],
          },
        },
      });
    });
  });

  describe('when calling relative path', () => {
    it('returns path correctly', () => {
      const mockPath = '/mock/final/path';
      mocked(relativePath).mockReturnValue(mockPath);
      expect(superjson.relativePath('path')).toEqual(mockPath);
    });
  });

  describe('when resolving path', () => {
    it('resolves path correctly', () => {
      const mockPath = '/mock/final/path';
      mocked(resolvePath).mockReturnValue(mockPath);
      expect(superjson.resolvePath('path')).toEqual(mockPath);
    });
  });

  describe('when merging security', () => {
    it('merges security correctly', () => {
      const mockLeft: SecurityValues[] = [
        {
          id: 'left-api-id',
          apikey: 'left-api-key',
        },
      ];

      const mockRight: SecurityValues[] = [
        {
          id: 'right-digest-id',
          digest: 'right-digest-key',
        },
      ];

      expect(mergeSecurity(mockLeft, mockRight)).toEqual([
        {
          id: 'left-api-id',
          apikey: 'left-api-key',
        },
        {
          id: 'right-digest-id',
          digest: 'right-digest-key',
        },
      ]);
    });

    it('overwrites existing security', () => {
      const mockLeft: SecurityValues[] = [
        {
          id: 'left-api-id',
          apikey: 'left-api-key',
        },
        {
          id: 'digest-id',
          digest: 'left-digest-key',
        },
      ];

      const mockRight: SecurityValues[] = [
        {
          id: 'digest-id',
          digest: 'right-digest-key',
        },
      ];

      expect(mergeSecurity(mockLeft, mockRight)).toEqual([
        {
          id: 'left-api-id',
          apikey: 'left-api-key',
        },
        {
          id: 'digest-id',
          digest: 'right-digest-key',
        },
      ]);
    });
  });

  describe('when detecting super json', () => {
    it('detects super.json in cwd', async () => {
      const mockCwd = 'path/to/';

      mocked(isAccessible).mockResolvedValue(true);
      mocked(relativePath).mockReturnValue(mockCwd);
      expect(await SuperJson.detectSuperJson(mockCwd)).toEqual(mockCwd);
      expect(isAccessible).toHaveBeenCalledTimes(1);
      expect(relativePath).toHaveBeenCalledTimes(1);
    }, 10000);

    it('detects super.json from 1 level above', async () => {
      const mockCwd = 'path/to/';

      mocked(isAccessible).mockResolvedValueOnce(false).mockResolvedValue(true);
      mocked(relativePath).mockReturnValue(mockCwd);
      expect(await SuperJson.detectSuperJson(process.cwd())).toEqual(mockCwd);
      expect(isAccessible).toHaveBeenCalledTimes(2);
      expect(relativePath).toHaveBeenCalledTimes(1);
    }, 10000);

    it('does not detect super.json from 2 levels above', async () => {
      const mockCwd = 'path/to/';

      mocked(isAccessible).mockResolvedValue(false);
      mocked(relativePath).mockReturnValue(mockCwd);

      expect(await SuperJson.detectSuperJson(mockCwd)).toBeUndefined();
      expect(isAccessible).toHaveBeenCalledTimes(2);
      expect(relativePath).not.toHaveBeenCalled();
    }, 10000);

    it('detects super.json from 1 level below', async () => {
      const mockCwd = 'path/to/';
      mocked(relativePath).mockReturnValue(mockCwd);
      mocked(isAccessible)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true);

      expect(await SuperJson.detectSuperJson(mockCwd, 1)).toEqual(mockCwd);
      expect(isAccessible).toHaveBeenCalledTimes(4);
      expect(relativePath).toHaveBeenCalledTimes(1);
    }, 10000);

    it('detects super.json from 2 levels below', async () => {
      const mockCwd = 'path/to/';
      mocked(relativePath).mockReturnValue(mockCwd);
      mocked(isAccessible)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      expect(await SuperJson.detectSuperJson(mockCwd, 2)).toEqual(mockCwd);
      expect(isAccessible).toHaveBeenCalledTimes(5);
      expect(relativePath).toHaveBeenCalledTimes(1);
    }, 10000);
  });

  // TODO: Proper tests for config hash and anonymization
  describe('when computing config hash', () => {
    it('does debug', () => {
      const superJson = new SuperJson({
        profiles: {
          abc: {
            file: 'x',
            priority: ['first', 'second'],
            providers: {
              second: {
                mapRevision: '1.0',
              },
              first: {
                file: 'file://some/path',
              },
            },
          },
          ghe: {
            version: '1.2.3',
          },
          def: 'file://hi/hello',
        },
        providers: {
          foo: {},
          bar: {
            file: 'hi',
          },
        },
      });

      expect(superJson.anonymized).toEqual({
        profiles: {
          abc: {
            version: 'file',
            providers: [
              {
                provider: 'second',
                priority: 1,
                version: '1.0',
              },
              {
                provider: 'first',
                priority: 0,
                version: 'file',
              },
            ],
          },
          ghe: {
            version: '1.2.3',
            providers: [],
          },
          def: {
            version: 'file',
            providers: [],
          },
        },
        providers: ['foo', 'bar'],
      });

      expect(superJson.configHash).toBe('d090f0589a19634c065e903a81006f79');
    });
  });
});
