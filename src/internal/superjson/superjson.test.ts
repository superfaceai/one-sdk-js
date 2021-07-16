import { promises as fsp, readFileSync, statSync } from 'fs';
import { relative as relativePath, resolve as resolvePath } from 'path';
import { mocked } from 'ts-jest/utils';

import { isAccessible } from '../../lib/io';
import { err, ok } from '../../lib/result/result';
import { mergeSecurity } from './mutate';
import * as normalize from './normalize';
import {
  BackoffKind,
  composeFileURI,
  isApiKeySecurityValues,
  isBasicAuthSecurityValues,
  isBearerTokenSecurityValues,
  isDigestSecurityValues,
  isFileURIString,
  isVersionString,
  NormalizedUsecaseDefaults,
  OnFail,
  ProfileEntry,
  ProfileProviderEntry,
  ProviderEntry,
  SecurityValues,
  trimFileURI,
  UsecaseDefaults,
} from './schema';
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
      expect(SuperJson.loadSync('test')).toEqual(
        err('unable to find test: Error: test')
      );
    });

    it('returns err when super.json is not file', () => {
      mocked(statSync).mockReturnValue({ ...mockStats, isFile: () => false });
      expect(SuperJson.loadSync('test')).toEqual(err(`'test' is not a file`));
    });

    it('returns err when unable to read super.json', () => {
      mocked(statSync).mockReturnValue(mockStats);
      mocked(readFileSync).mockImplementation(() => {
        throw mockError;
      });
      expect(SuperJson.loadSync('test')).toEqual(
        err('unable to read test: Error: test')
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

    it('returns err when there is an error during parsing super.json - defaults missing', () => {
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
      await expect(SuperJson.load('test')).resolves.toEqual(
        err('unable to find test: Error: test')
      );
    });

    it('returns err when super.json is not file', async () => {
      jest
        .spyOn(fsp, 'stat')
        .mockResolvedValue({ ...mockStats, isFile: () => false });
      await expect(SuperJson.load('test')).resolves.toEqual(
        err(`'test' is not a file`)
      );
    });

    it('returns err when unable to read super.json', async () => {
      jest.spyOn(fsp, 'stat').mockResolvedValue(mockStats);
      jest.spyOn(fsp, 'readFile').mockRejectedValue(mockError);
      await expect(SuperJson.load('test')).resolves.toEqual(
        err('unable to read test: Error: test')
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
        new Error(
          'invalid profile provider entry format: ' + mockProfileProviderEntry
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
        new Error('invalid profile entry format: ' + mockProfileEntry)
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
        new Error('invalid provider entry format: ' + mockProviderEntry)
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
  describe('when adding profile defaults', () => {
    it('adds profile deafults to empty super.json multiple times', () => {
      const mockProfileName = 'profile';
      const mockUseCaseName = 'usecase';

      let mockProfileDeafultsEntry: UsecaseDefaults = {
        [mockUseCaseName]: { providerFailover: false, input: { test: 'test' } },
      };

      expect(
        superjson.addProfileDefaults(mockProfileName, mockProfileDeafultsEntry)
      ).toEqual(true);
      expect(superjson.document.profiles?.[mockProfileName]).toEqual({
        defaults: {
          [mockUseCaseName]: {
            providerFailover: false,
            input: { test: 'test' },
          },
        },
        version: '0.0.0',
      });

      mockProfileDeafultsEntry = {
        [mockUseCaseName]: {
          providerFailover: true,
          input: { test: 'new-test' },
        },
      };

      expect(
        superjson.addProfileDefaults(mockProfileName, mockProfileDeafultsEntry)
      ).toEqual(true);
      expect(superjson.document.profiles?.[mockProfileName]).toEqual({
        defaults: {
          [mockUseCaseName]: {
            providerFailover: true,
            input: { test: 'new-test' },
          },
        },
        version: '0.0.0',
      });
    });

    it('adds profile deafults to super.json with profile using uri path multiple times', () => {
      const mockProfileName = 'profile';
      const mockUseCaseName = 'usecase';

      superjson = new SuperJson({
        profiles: { [mockProfileName]: 'file://some/path' },
      });

      let mockProfileDeafultsEntry: UsecaseDefaults = {
        [mockUseCaseName]: { providerFailover: false, input: { test: 'test' } },
      };

      expect(
        superjson.addProfileDefaults(mockProfileName, mockProfileDeafultsEntry)
      ).toEqual(true);
      expect(superjson.document.profiles?.[mockProfileName]).toEqual({
        defaults: {
          [mockUseCaseName]: {
            providerFailover: false,
            input: { test: 'test' },
          },
        },
        file: 'file://some/path',
      });

      mockProfileDeafultsEntry = {
        [mockUseCaseName]: {
          providerFailover: true,
          input: { test: 'new-test' },
        },
      };

      expect(
        superjson.addProfileDefaults(mockProfileName, mockProfileDeafultsEntry)
      ).toEqual(true);
      expect(superjson.document.profiles?.[mockProfileName]).toEqual({
        defaults: {
          [mockUseCaseName]: {
            providerFailover: true,
            input: { test: 'new-test' },
          },
        },
        file: 'file://some/path',
      });
    });

    it('adds profile deafults to super.json with existing profile multiple times', () => {
      const mockProfileName = 'profile';
      const mockUseCaseName = 'usecase';

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: {
            version: '1.0.0',
            priority: ['test'],
            providers: { test: {} },
          },
        },
      });

      let mockProfileDeafultsEntry: UsecaseDefaults = {
        [mockUseCaseName]: { providerFailover: true, input: { test: 'test' } },
      };

      expect(
        superjson.addProfileDefaults(mockProfileName, mockProfileDeafultsEntry)
      ).toEqual(true);
      expect(superjson.document.profiles?.[mockProfileName]).toEqual({
        defaults: {
          [mockUseCaseName]: {
            providerFailover: true,
            input: { test: 'test' },
          },
        },
        version: '1.0.0',
        priority: ['test'],
        providers: { test: {} },
      });

      mockProfileDeafultsEntry = {
        [mockUseCaseName]: {
          providerFailover: false,
          input: { test: 'new-test' },
        },
      };

      expect(
        superjson.addProfileDefaults(mockProfileName, mockProfileDeafultsEntry)
      ).toEqual(true);
      expect(superjson.document.profiles?.[mockProfileName]).toEqual({
        defaults: {
          [mockUseCaseName]: {
            providerFailover: false,
            input: { test: 'new-test' },
          },
        },
        version: '1.0.0',
        priority: ['test'],
        providers: { test: {} },
      });
    });

    it('adds profile deafults to super.json with existing profile and existing defaults multiple times', () => {
      const mockProfileName = 'profile';
      const mockUseCaseName = 'usecase';

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: {
            version: '1.0.0',
            priority: ['test'],
            defaults: { [mockUseCaseName]: { providerFailover: false } },
            providers: { test: {} },
          },
        },
      });

      let mockProfileDeafultsEntry: UsecaseDefaults = {
        [mockUseCaseName]: { providerFailover: true, input: { test: 'test' } },
      };

      expect(
        superjson.addProfileDefaults(mockProfileName, mockProfileDeafultsEntry)
      ).toEqual(true);
      expect(superjson.document.profiles?.[mockProfileName]).toEqual({
        defaults: {
          [mockUseCaseName]: {
            providerFailover: true,
            input: { test: 'test' },
          },
        },
        version: '1.0.0',
        priority: ['test'],
        providers: { test: {} },
      });

      mockProfileDeafultsEntry = {
        [mockUseCaseName]: {
          providerFailover: false,
          input: { test: 'new-test' },
        },
      };

      expect(
        superjson.addProfileDefaults(mockProfileName, mockProfileDeafultsEntry)
      ).toEqual(true);
      expect(superjson.document.profiles?.[mockProfileName]).toEqual({
        defaults: {
          [mockUseCaseName]: {
            providerFailover: false,
            input: { test: 'new-test' },
          },
        },
        version: '1.0.0',
        priority: ['test'],
        providers: { test: {} },
      });
    });
  });

  describe('when adding profile', () => {
    it('adds profile to empty super.json using uri path', () => {
      const mockProfileName = 'profile';
      const mockProfileEntry: ProfileEntry = 'file://some/path';

      expect(superjson.addProfile(mockProfileName, mockProfileEntry)).toEqual(
        true
      );
      expect(superjson.normalized.profiles[mockProfileName]).toEqual({
        defaults: {},
        priority: [],
        file: 'some/path',
        providers: {},
      });
    });

    it('adds multiple profiles', () => {
      let mockProfileName = 'profile';
      const mockProfileEntry: ProfileEntry = 'file://some/path';

      expect(superjson.addProfile(mockProfileName, mockProfileEntry)).toEqual(
        true
      );
      expect(superjson.normalized.profiles[mockProfileName]).toEqual({
        defaults: {},
        priority: [],
        file: 'some/path',
        providers: {},
      });

      mockProfileName = 'second-profile';

      expect(superjson.addProfile(mockProfileName, mockProfileEntry)).toEqual(
        true
      );

      expect(superjson.normalized.profiles).toEqual({
        profile: {
          defaults: {},
          file: 'some/path',
          priority: [],
          providers: {},
        },
        ['second-profile']: {
          defaults: {},
          file: 'some/path',
          priority: [],
          providers: {},
        },
      });
    });

    it('adds profile to super.json with empty profile defaults using uri path', () => {
      const mockProfileName = 'profile';
      const mockProfileEntry: ProfileEntry = 'file://some/path';

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: {
            defaults: {},
            file: 'some/path',
            providers: {},
          },
        },
      });
      expect(superjson.addProfile(mockProfileName, mockProfileEntry)).toEqual(
        true
      );
      expect(superjson.normalized.profiles[mockProfileName]).toEqual({
        defaults: {},
        priority: [],
        file: 'some/path',
        providers: {},
      });
    });

    it('adds profile to super.json using uri path', () => {
      const mockProfileName = 'profile';
      const mockProfileEntry: ProfileEntry = 'file://some/path';

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: {
            defaults: { input: { input: { test: 'test' } } },
            file: 'some/path',
            providers: {},
          },
        },
      });
      expect(superjson.addProfile(mockProfileName, mockProfileEntry)).toEqual(
        true
      );
      expect(superjson.normalized.profiles[mockProfileName]).toEqual({
        defaults: {
          input: { input: { test: 'test' }, providerFailover: false },
        },
        priority: [],
        file: 'some/path',
        providers: {},
      });
    });

    it('adds profile to super.json using version string', () => {
      const mockProfileName = 'profile';
      const mockProfileEntry: ProfileEntry = '1.0.0';

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: {
            defaults: { input: { input: { test: 'test' } } },
            file: 'some/path',
            providers: {},
          },
        },
      });
      expect(superjson.addProfile(mockProfileName, mockProfileEntry)).toEqual(
        true
      );
      expect(superjson.normalized.profiles[mockProfileName]).toEqual({
        defaults: {
          input: { input: { test: 'test' }, providerFailover: false },
        },
        priority: [],
        providers: {},
        version: '1.0.0',
      });
    });

    it('adds profile to super.json using version string and empty defaults', () => {
      const mockProfileName = 'profile';
      const mockProfileEntry: ProfileEntry = '1.0.0';

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: {
            defaults: {},
            file: 'some/path',
            providers: {},
          },
        },
      });
      expect(superjson.addProfile(mockProfileName, mockProfileEntry)).toEqual(
        true
      );
      expect(superjson.normalized.profiles[mockProfileName]).toEqual({
        defaults: {},
        priority: [],
        providers: {},
        version: '1.0.0',
      });
    });

    it('throws error on invalid payload string', () => {
      const mockProfileName = 'profile';
      const mockProfileEntry: ProfileEntry = 'madeup';

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: {
            defaults: { input: { input: { test: 'test' } } },
            file: 'some/path',
            providers: {},
          },
        },
      });
      expect(() =>
        superjson.addProfile(mockProfileName, mockProfileEntry)
      ).toThrowError(new Error('Invalid string payload format'));
    });

    it('adds profile to super.json', () => {
      const mockProfileName = 'profile';
      const mockProfileEntry: ProfileEntry = {
        defaults: {},
        file: 'some/path',
        providers: {},
      };

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: {
            defaults: { input: { input: { test: 'test' } } },
            file: 'some/path',
            providers: { test: {} },
          },
        },
      });
      expect(superjson.addProfile(mockProfileName, mockProfileEntry)).toEqual(
        true
      );
      expect(superjson.normalized.profiles[mockProfileName]).toEqual({
        defaults: {
          input: { input: { test: 'test' }, providerFailover: false },
        },
        file: 'some/path',
        priority: ['test'],
        providers: {
          test: {
            defaults: {
              input: {
                input: { test: 'test' },
                retryPolicy: { kind: OnFail.NONE },
              },
            },
            mapRevision: undefined,
            mapVariant: undefined,
          },
        },
      });
    });

    it('adds profile to super.json with string targed profile', () => {
      const mockProfileName = 'profile';
      const mockProfileEntry: ProfileEntry = {
        defaults: {},
        file: 'some/path',
        providers: { test: {} },
      };

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: '0.0.0',
        },
      });
      expect(superjson.addProfile(mockProfileName, mockProfileEntry)).toEqual(
        true
      );
      expect(superjson.normalized.profiles[mockProfileName]).toEqual({
        defaults: {},
        file: 'some/path',
        priority: ['test'],
        providers: {
          test: {
            defaults: {},
            mapRevision: undefined,
            mapVariant: undefined,
          },
        },
      });
    });

    it('adds profile to super.json with priority and disabled providerFailover', () => {
      const mockProfileName = 'profile';
      const mockUseCaseName = 'usecase';

      const mockProfileEntry: ProfileEntry = {
        defaults: {
          [mockUseCaseName]: {
            providerFailover: false,
          },
        },
        priority: ['test'],
        file: 'some/path',
        providers: { test: {} },
      };

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: '0.0.0',
        },
      });
      expect(superjson.addProfile(mockProfileName, mockProfileEntry)).toEqual(
        true
      );
      expect(superjson.normalized.profiles[mockProfileName]).toEqual({
        defaults: {
          [mockUseCaseName]: {
            input: {},
            providerFailover: false,
          },
        },
        file: 'some/path',
        priority: ['test'],
        providers: {
          test: {
            defaults: {
              [mockUseCaseName]: {
                input: {},
                retryPolicy: {
                  kind: 'none',
                },
              },
            },
            mapRevision: undefined,
            mapVariant: undefined,
          },
        },
      });
    });

    it('adds profile to super.json with priority and enabled providerFailover', () => {
      const mockProfileName = 'profile';
      const mockUseCaseName = 'usecase';

      const mockProfileEntry: ProfileEntry = {
        defaults: {
          [mockUseCaseName]: {
            providerFailover: true,
          },
        },
        priority: ['test'],
        file: 'some/path',
        providers: { test: {} },
      };

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: '0.0.0',
        },
      });
      expect(superjson.addProfile(mockProfileName, mockProfileEntry)).toEqual(
        true
      );
      expect(superjson.normalized.profiles[mockProfileName]).toEqual({
        defaults: {
          [mockUseCaseName]: {
            input: {},
            providerFailover: true,
          },
        },
        file: 'some/path',
        priority: ['test'],
        providers: {
          test: {
            defaults: {
              [mockUseCaseName]: {
                input: {},
                retryPolicy: {
                  kind: 'none',
                },
              },
            },
            mapRevision: undefined,
            mapVariant: undefined,
          },
        },
      });
    });

    it('adds profile to super.json with existing priority, enabled providerFailover and retry policy', () => {
      const mockProfileName = 'profile';
      const mockUseCaseName = 'usecase';

      const mockProfileEntry: ProfileEntry = {
        defaults: {
          [mockUseCaseName]: {
            providerFailover: true,
          },
        },
        priority: ['test'],
        file: 'some/path',
        providers: {
          test: {
            defaults: {
              [mockUseCaseName]: {
                input: {},
                retryPolicy: {
                  kind: OnFail.CIRCUIT_BREAKER,
                  //Different numbers
                  maxContiguousRetries: 10,
                  requestTimeout: 60_000,
                },
              },
            },
            mapRevision: undefined,
            mapVariant: undefined,
          },
        },
      };

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: {
            defaults: {
              [mockUseCaseName]: {
                providerFailover: true,
              },
            },
            priority: ['test'],
            file: 'some/path',
            providers: {
              test: {
                defaults: {
                  [mockUseCaseName]: {
                    input: {},
                    retryPolicy: {
                      kind: OnFail.CIRCUIT_BREAKER,
                      maxContiguousRetries: 1,
                      requestTimeout: 1500,
                    },
                  },
                },
                mapRevision: undefined,
                mapVariant: undefined,
              },
            },
          },
        },
      });
      expect(superjson.addProfile(mockProfileName, mockProfileEntry)).toEqual(
        true
      );
      expect(superjson.normalized.profiles[mockProfileName]).toEqual({
        defaults: {
          [mockUseCaseName]: {
            input: {},
            providerFailover: true,
          },
        },
        file: 'some/path',
        priority: ['test'],
        providers: {
          test: {
            defaults: {
              [mockUseCaseName]: {
                input: {},
                retryPolicy: {
                  kind: OnFail.CIRCUIT_BREAKER,
                  maxContiguousRetries: 10,
                  requestTimeout: 60_000,
                },
              },
            },
            mapRevision: undefined,
            mapVariant: undefined,
          },
        },
      });
    });
  });

  describe('when adding profile provider', () => {
    it('adds mutliple profile provider', () => {
      const mockProfileName = 'profile';
      let mockProviderName = 'provider';
      const mockProfileProviderEntry: ProfileProviderEntry = 'file://some/path';

      expect(
        superjson.addProfileProvider(
          mockProfileName,
          mockProviderName,
          mockProfileProviderEntry
        )
      ).toEqual(true);
      expect(superjson.normalized.profiles[mockProfileName]).toEqual({
        defaults: {},
        priority: [mockProviderName],
        providers: {
          [mockProviderName]: {
            defaults: {},
            file: 'some/path',
          },
        },
        version: '0.0.0',
      });

      mockProviderName = 'second-provider';

      expect(
        superjson.addProfileProvider(
          mockProfileName,
          mockProviderName,
          mockProfileProviderEntry
        )
      ).toEqual(true);

      expect(superjson.normalized.profiles).toEqual({
        profile: {
          defaults: {},
          priority: ['provider', mockProviderName],
          providers: {
            provider: {
              defaults: {},
              file: 'some/path',
            },
            ['second-provider']: {
              defaults: {},
              file: 'some/path',
            },
          },
          version: '0.0.0',
        },
      });
    });

    it('adds profile provider to empty super.json using uri path', () => {
      const mockProfileName = 'profile';
      const mockProviderName = 'provider';
      const mockProfileProviderEntry: ProfileProviderEntry = 'file://some/path';

      expect(
        superjson.addProfileProvider(
          mockProfileName,
          mockProviderName,
          mockProfileProviderEntry
        )
      ).toEqual(true);
      expect(superjson.normalized.profiles[mockProfileName]).toEqual({
        defaults: {},
        priority: [mockProviderName],
        providers: {
          [mockProviderName]: {
            defaults: {},
            file: 'some/path',
          },
        },
        version: '0.0.0',
      });
    });

    it('adds profile provider to super.json without profile provider using uri path correctly', () => {
      const mockProfileName = 'profile';
      const mockProviderName = 'provider';
      const mockProfileProviderEntry: ProfileProviderEntry = 'file://some/path';

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: { defaults: {}, file: 'some/path' },
        },
      });

      expect(
        superjson.addProfileProvider(
          mockProfileName,
          mockProviderName,
          mockProfileProviderEntry
        )
      ).toEqual(true);
      expect(superjson.normalized.profiles[mockProfileName]).toEqual({
        defaults: {},
        file: 'some/path',
        priority: [mockProviderName],
        providers: {
          [mockProviderName]: {
            defaults: {},
            file: 'some/path',
          },
        },
      });
    });

    it('adds profile provider to super.json with empty profile provider using uri path correctly', () => {
      const mockProfileName = 'profile';
      const mockProviderName = 'provider';
      const mockProfileProviderEntry: ProfileProviderEntry = 'file://some/path';

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: {
            defaults: {},
            file: 'some/path',
            providers: { [mockProviderName]: {} },
          },
        },
      });

      expect(
        superjson.addProfileProvider(
          mockProfileName,
          mockProviderName,
          mockProfileProviderEntry
        )
      ).toEqual(true);
      expect(superjson.normalized.profiles[mockProfileName]).toEqual({
        defaults: {},
        file: 'some/path',
        priority: [mockProviderName],
        providers: {
          [mockProviderName]: {
            defaults: {},
            file: 'some/path',
          },
        },
      });
    });

    it('adds profile provider to super.json with profile provider using uri path correctly', () => {
      const mockProfileName = 'profile';
      const mockProviderName = 'provider';
      const mockProfileProviderEntry: ProfileProviderEntry = 'file://some/path';

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: {
            defaults: {},
            file: 'some/path',
            providers: {
              [mockProviderName]: {
                file: 'provider/path',
                defaults: { input: { input: { test: 'test' } } },
              },
            },
          },
        },
      });

      expect(
        superjson.addProfileProvider(
          mockProfileName,
          mockProviderName,
          mockProfileProviderEntry
        )
      ).toEqual(true);
      expect(superjson.normalized.profiles[mockProfileName]).toEqual({
        defaults: {},
        file: 'some/path',
        priority: [mockProviderName],
        providers: {
          [mockProviderName]: {
            defaults: {
              input: {
                input: { test: 'test' },
                retryPolicy: { kind: OnFail.NONE },
              },
            },
            file: 'some/path',
          },
        },
      });
    });

    it('adds profile provider to super.json with profile provider using entry correctly', () => {
      const mockProfileName = 'profile';
      const mockProviderName = 'provider';
      const mockProfileProviderEntry: ProfileProviderEntry = {
        file: 'provider/path',
        defaults: { input: { input: { test: 'test' } } },
      };

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: {
            defaults: {},
            file: 'some/path',
            providers: {
              [mockProviderName]: {
                file: 'provider/path',
                defaults: { input: { input: { test: 'test' } } },
              },
            },
          },
        },
      });

      expect(
        superjson.addProfileProvider(
          mockProfileName,
          mockProviderName,
          mockProfileProviderEntry
        )
      ).toEqual(true);
      expect(superjson.normalized.profiles[mockProfileName]).toEqual({
        defaults: {},
        file: 'some/path',
        priority: [mockProviderName],
        providers: {
          [mockProviderName]: {
            defaults: {
              input: {
                input: { test: 'test' },
                retryPolicy: { kind: OnFail.NONE },
              },
            },
            file: 'provider/path',
          },
        },
      });
    });

    it('adds profile provider to super.json with profile provider using map variant correctly', () => {
      const mockProfileName = 'profile';
      const mockProviderName = 'provider';
      const mockProfileProviderEntry: ProfileProviderEntry = {
        mapVariant: 'test',
        mapRevision: 'test',
        defaults: { input: { input: { test: 'test' } } },
      };

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: {
            defaults: {},
            file: 'some/path',
            providers: {
              [mockProviderName]: {
                file: 'provider/path',
                defaults: { input: { input: { test: 'test' } } },
              },
            },
          },
        },
      });

      expect(
        superjson.addProfileProvider(
          mockProfileName,
          mockProviderName,
          mockProfileProviderEntry
        )
      ).toEqual(true);
      expect(superjson.normalized.profiles[mockProfileName]).toEqual({
        defaults: {},
        file: 'some/path',
        priority: [mockProviderName],
        providers: {
          [mockProviderName]: {
            defaults: {
              input: {
                input: { test: 'test' },
                retryPolicy: { kind: OnFail.NONE },
              },
            },
            mapVariant: 'test',
            mapRevision: 'test',
          },
        },
      });
    });

    it('adds profile provider to super.json with string profile provider correctly', () => {
      const mockProfileName = 'profile';
      const mockProviderName = 'provider';
      const mockProfileProviderEntry: ProfileProviderEntry = {
        mapVariant: 'test',
        mapRevision: 'test',
        defaults: { input: { input: { test: 'test' } } },
      };

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: {
            defaults: {},
            file: 'some/path',
            providers: {
              [mockProviderName]: '0.0.0',
            },
          },
        },
      });

      expect(
        superjson.addProfileProvider(
          mockProfileName,
          mockProviderName,
          mockProfileProviderEntry
        )
      ).toEqual(true);
      expect(superjson.normalized.profiles[mockProfileName]).toEqual({
        defaults: {},
        file: 'some/path',
        priority: [mockProviderName],
        providers: {
          [mockProviderName]: {
            defaults: {
              input: {
                input: { test: 'test' },
                retryPolicy: { kind: OnFail.NONE },
              },
            },
            mapVariant: 'test',
            mapRevision: 'test',
          },
        },
      });
    });

    it('adds profile provider to super.json with exisitng profile provider but without defaults', () => {
      const mockProfileName = 'profile';
      const mockProviderName = 'provider';
      const mockProfileProviderEntry: ProfileProviderEntry = {
        defaults: { input: { input: { test: 'test' } } },
      };

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: {
            defaults: {},
            file: 'some/path',
            providers: {
              [mockProviderName]: {
                file: 'provider/path',
              },
            },
          },
        },
      });

      expect(
        superjson.addProfileProvider(
          mockProfileName,
          mockProviderName,
          mockProfileProviderEntry
        )
      ).toEqual(true);
      expect(superjson.normalized.profiles[mockProfileName]).toEqual({
        defaults: {},
        file: 'some/path',
        priority: [mockProviderName],
        providers: {
          [mockProviderName]: {
            defaults: {
              input: {
                input: { test: 'test' },
                retryPolicy: { kind: OnFail.NONE },
              },
            },
            file: 'provider/path',
          },
        },
      });
    });

    it('returns false if super.json wasnt updated', () => {
      const mockProfileName = 'profile';
      const mockProviderName = 'provider';
      const mockProfileProviderEntry: ProfileProviderEntry = {};

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: {
            defaults: {},
            file: 'some/path',
            providers: {
              [mockProviderName]: {
                file: 'provider/path',
              },
            },
          },
        },
      });

      expect(
        superjson.addProfileProvider(
          mockProfileName,
          mockProviderName,
          mockProfileProviderEntry
        )
      ).toEqual(false);
      expect(superjson.normalized.profiles[mockProfileName]).toEqual({
        defaults: {},
        file: 'some/path',
        priority: [mockProviderName],
        providers: {
          [mockProviderName]: {
            defaults: {},
            file: 'provider/path',
          },
        },
      });
    });
  });

  describe('when adding provider', () => {
    it('adds provider using uri path correctly', () => {
      const mockProviderName = 'provider';
      const mockProviderEntry: ProviderEntry = 'file://some/path';

      superjson.addProvider(mockProviderName, mockProviderEntry);
      expect(superjson.normalized.providers[mockProviderName]).toEqual({
        file: 'some/path',
        security: [],
      });
    });

    it('adds multiple providers', () => {
      let mockProviderName = 'provider';
      const mockProviderEntry: ProviderEntry = 'file://some/path';

      superjson.addProvider(mockProviderName, mockProviderEntry);
      expect(superjson.normalized.providers).toEqual({
        [mockProviderName]: {
          file: 'some/path',
          security: [],
        },
      });

      mockProviderName = 'second-provider';

      superjson.addProvider(mockProviderName, mockProviderEntry);
      expect(superjson.normalized.providers).toEqual({
        provider: {
          file: 'some/path',
          security: [],
        },
        ['second-provider']: {
          file: 'some/path',
          security: [],
        },
      });
    });

    it('adds provider using uri path with existing targed provider correctly', () => {
      const mockProviderName = 'provider';
      const mockProviderEntry: ProviderEntry = 'file://some/path';
      superjson = new SuperJson({
        providers: {
          [mockProviderName]: 'targed/provider/path',
        },
      });

      superjson.addProvider(mockProviderName, mockProviderEntry);
      expect(superjson.normalized.providers[mockProviderName]).toEqual({
        file: 'some/path',
        security: [],
      });
    });

    it('adds provider using provider entry correctly', () => {
      const mockProviderName = 'provider';
      const mockProviderEntry: ProviderEntry = {
        file: 'some/path',
        security: [
          {
            id: 'api-id',
            apikey: 'api-key',
          },
        ],
      };

      superjson.addProvider(mockProviderName, mockProviderEntry);
      expect(superjson.normalized.providers[mockProviderName]).toEqual({
        file: 'some/path',
        security: [
          {
            id: 'api-id',
            apikey: 'api-key',
          },
        ],
      });
    });

    it('adds provider using provider entry with existing targed provider correctly', () => {
      const mockProviderName = 'provider';
      const mockProviderEntry: ProviderEntry = {
        file: 'some/path',
        security: [
          {
            id: 'api-id',
            apikey: 'api-key',
          },
        ],
      };
      superjson = new SuperJson({
        providers: {
          [mockProviderName]: 'targed/provider/path',
        },
      });

      superjson.addProvider(mockProviderName, mockProviderEntry);
      expect(superjson.normalized.providers[mockProviderName]).toEqual({
        file: 'some/path',
        security: [
          {
            id: 'api-id',
            apikey: 'api-key',
          },
        ],
      });
    });

    it('throws error on invalid string payload', () => {
      const mockProviderName = 'provider';
      const mockProviderEntry: ProviderEntry = 'made-up';

      expect(() =>
        superjson.addProvider(mockProviderName, mockProviderEntry)
      ).toThrowError(new Error('Invalid string payload format'));
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

  describe('when adding priority', () => {
    it('adds priority to empty super.json', () => {
      const mockProfileName = 'communication/send-email';
      const mockPriorityArray = ['first', 'second', 'third'];

      expect(() =>
        superjson.addPriority(mockProfileName, mockPriorityArray)
      ).toThrowError(new Error(`Profile "${mockProfileName}" does not exist`));
    });

    it('adds priority to super.json - profile with shorthand notations', () => {
      const mockProfileName = 'profile';
      const mockPriorityArray = ['first', 'second', 'third'];

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: '1.2.3',
        },
      });
      expect(() =>
        superjson.addPriority(mockProfileName, mockPriorityArray)
      ).toThrowError(
        new Error(
          `Unable to set priority on profile "${mockProfileName}" - some of priority providers not set in profile providers property`
        )
      );
    });

    it('adds priority to super.json - profile without profile providers', () => {
      const mockProfileName = 'profile';
      const mockPriorityArray = ['first', 'second', 'third'];

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: {
            defaults: {},
            file: 'some/path',
          },
        },
      });
      expect(() =>
        superjson.addPriority(mockProfileName, mockPriorityArray)
      ).toThrowError(
        new Error(
          `Unable to set priority on profile "${mockProfileName}" - profile providers not set`
        )
      );
    });

    it('adds priority to super.json - some of providers are missing in profile providers', () => {
      const mockProfileName = 'profile';
      const mockPriorityArray = ['first', 'second', 'third'];

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: {
            defaults: {},
            file: 'some/path',
            providers: {
              first: {},
              second: {},
            },
          },
        },
      });
      expect(() =>
        superjson.addPriority(mockProfileName, mockPriorityArray)
      ).toThrowError(
        new Error(
          `Unable to set priority on profile "${mockProfileName}" - some of priority providers not set in profile providers property`
        )
      );
    });

    it('adds priority to super.json - missing providers', () => {
      const mockProfileName = 'profile';
      const mockPriorityArray = ['first', 'second', 'third'];

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: {
            defaults: {},
            file: 'some/path',
            providers: {
              first: {},
              second: {},
              third: {},
            },
          },
        },
      });
      expect(() =>
        superjson.addPriority(mockProfileName, mockPriorityArray)
      ).toThrowError(
        new Error(
          `Unable to set priority on profile "${mockProfileName}" - providers not set`
        )
      );
    });

    it('adds priority to super.json - some of providers in priority array are missing in providers property', () => {
      const mockProfileName = 'profile';
      const mockPriorityArray = ['first', 'second', 'third'];

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: {
            defaults: {},
            file: 'some/path',
            providers: {
              first: {},
              second: {},
              third: {},
            },
          },
        },
        providers: {
          first: {},
          second: {},
        },
      });
      expect(() =>
        superjson.addPriority(mockProfileName, mockPriorityArray)
      ).toThrowError(
        new Error(
          `Unable to set priority on profile "${mockProfileName}" - some of priority providers not set in provider property`
        )
      );
    });

    it('adds priority to super.json - exisiting priority is same as new priority', () => {
      const mockProfileName = 'profile';
      const mockPriorityArray = ['first', 'second', 'third'];

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: {
            defaults: {},
            priority: ['first', 'second', 'third'],
            file: 'some/path',
            providers: {
              first: {},
              second: {},
              third: {},
            },
          },
        },
        providers: {
          first: {},
          second: {},
          third: {},
        },
      });
      expect(() =>
        superjson.addPriority(mockProfileName, mockPriorityArray)
      ).toThrowError(
        new Error(
          `Unable to set priority on profile "${mockProfileName}" - existing priority is same as new priority`
        )
      );
    });

    it('adds priority to super.json', () => {
      const mockProfileName = 'profile';
      const mockPriorityArray = ['first', 'second', 'third'];

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: {
            defaults: {},
            file: 'some/path',
            providers: {
              first: {},
              second: {},
              third: {},
            },
          },
        },
        providers: {
          first: {},
          second: {},
          third: {},
        },
      });
      expect(superjson.addPriority(mockProfileName, mockPriorityArray)).toEqual(
        true
      );

      expect(superjson.normalized.profiles[mockProfileName]).toEqual({
        defaults: {},
        priority: mockPriorityArray,
        providers: {
          first: {
            defaults: {},
          },
          second: {
            defaults: {},
          },
          third: {
            defaults: {},
          },
        },
        file: 'some/path',
      });
    });
  });
});
