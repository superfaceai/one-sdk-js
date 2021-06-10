import { promises as fsp, readFileSync, statSync } from 'fs';
import {
  join as joinPath,
  relative as relativePath,
  resolve as resolvePath,
} from 'path';
import { mocked } from 'ts-jest/utils';

import { isAccessible } from '../../lib/io';
import { err, ok } from '../../lib/result/result';
import {
  composeFileURI,
  isApiKeySecurityValues,
  isBasicAuthSecurityValues,
  isBearerTokenSecurityValues,
  isDigestSecurityValues,
  isFileURIString,
  isVersionString,
  NormalizedUsecaseDefaults,
  ProfileEntry,
  ProfileProviderEntry,
  ProviderEntry,
  SecurityValues,
  trimFileURI,
} from './schema';
import { SuperJson } from './superjson';
import * as normalize from './normalize';
import { mergeSecurity } from './mutate';

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

      expect(normalize.normalizeProfileSettings(mockProfileEntry)).toEqual({
        file: 'some/path',
        defaults: {},
        providers: {},
      });
    });

    it('returns correct object when entry is version', async () => {
      const mockProfileEntry = '1.0.0';

      expect(normalize.normalizeProfileSettings(mockProfileEntry)).toEqual({
        version: '1.0.0',
        defaults: {},
        providers: {},
      });
    });

    it('throws error when entry is unknown string', async () => {
      const mockProfileEntry = 'madeup';
      expect(() =>
      normalize.normalizeProfileSettings(mockProfileEntry)
      ).toThrowError(
        new Error('invalid profile entry format: ' + mockProfileEntry)
      );
    });

    it('returns correct object when entry contains file', async () => {
      const mockProfileEntry = {
        file: 'some/path',
      };

      expect(normalize.normalizeProfileSettings(mockProfileEntry)).toEqual({
        file: 'some/path',
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
            defaults: {},
            providers: {},
          },
        },
      });

      const normalizeProfileSettingsSpy = jest.spyOn(normalize, 'normalizeProfileSettings');
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

  describe('when getting default path', () => {
    it('returns correct path', () => {
      mocked(joinPath).mockReturnValue('/some/path');
      expect(SuperJson.defaultPath()).toEqual('/some/path');
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
            "deployments": {
              "default": {
                "baseUrl": "https://www.some.differentUrl"
              }
            },
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
        },
        "lock": {
          "starwars/character-information@^1.1": {
            "version": "1.1.5",
            "resolved": "https://store.superface.ai/profile/starwars/character-information@1.1.5",
              "integrity": "sha512-0NKGC8Nf/4vvDpWKB7bwxIazvNnNHnZBX6XlyBXNl+fW8tpTef3PNMJMSErTz9LFnuv61vsKbc36u/Ek2YChWg==",
            "astResolved": "",
            "astIntegrity": "sha512-0NKGC8Nf/4vvDpWKB7bwxIazvNnNHnZBX6XlyBXNl+fW8tpTef3PNMJMSErTz9LFnuv61vsKbc36u/Ek2YChWg=="
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
            "defaults": {
              "Test": {}
            }
          },
          "y/a": {
            "version": "1.2.3",
            "providers": {
              "foo": "file://y/a.suma",
              "baz": {
                "mapVariant": "bugfix"
              }
            }
          },
          "y/b": {
            "version": "1.2.3",
            "defaults": {
              "Usecase": {
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
                    "input": {}
                  }
                }
              },
              "bar": {
                "defaults": {
                  "Usecase": {
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
            providers: {},
            file: 'a.supr',
          },
          b: {
            defaults: {},
            providers: {},
            version: '0.1.0',
          },
          'x/a': {
            defaults: {},
            providers: {},
            file: 'x/a.supr',
          },
          'x/b': {
            defaults: {
              Test: {
                input: {},
              },
            },
            providers: {},
            version: '0.2.1',
          },
          'y/a': {
            defaults: {},
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
              },
            },
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
                  },
                },
                mapVariant: undefined,
                mapRevision: undefined,
              },
            },
            version: '1.2.3',
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

  describe('when adding profile', () => {
    it('adds profile to empty super.json using uri path', () => {
      const mockProfileName = 'profile';
      const mockProfileEntry: ProfileEntry = 'file://some/path';

      expect(superjson.addProfile(mockProfileName, mockProfileEntry)).toEqual(
        true
      );
      expect(superjson.normalized.profiles[mockProfileName]).toEqual({
        defaults: {},
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
          providers: {},
        },
        ['second-profile']: {
          defaults: {},
          file: 'some/path',
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
        defaults: { input: { input: { test: 'test' } } },
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
        defaults: { input: { input: { test: 'test' } } },
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
        defaults: { input: { input: { test: 'test' } } },
        file: 'some/path',
        providers: {
          test: {
            defaults: { input: { input: { test: 'test' } } },
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
        providers: {
          test: {
            defaults: {},
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
        providers: {
          [mockProviderName]: {
            defaults: { input: { input: { test: 'test' } } },
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
        providers: {
          [mockProviderName]: {
            defaults: { input: { input: { test: 'test' } } },
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
        providers: {
          [mockProviderName]: {
            defaults: { input: { input: { test: 'test' } } },
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
        providers: {
          [mockProviderName]: {
            defaults: { input: { input: { test: 'test' } } },
            mapVariant: 'test',
            mapRevision: 'test',
          },
        },
      });
    });

    it('returns false if super.json wasnt updated', () => {
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
      ).toEqual(false);
      expect(superjson.normalized.profiles[mockProfileName]).toEqual({
        defaults: {},
        file: 'some/path',
        providers: {
          [mockProviderName]: {
            defaults: { input: { input: { test: 'test' } } },
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

  describe('when computing config hash', () => {
    it('does debug', () => {
      const superJson = new SuperJson(
        {
          profiles: {
            abc: {
              file: 'x'
            },
            ghe: {
              version: '1.2.3'
            },
            def: 'file://hi/hello'
          },
          providers: {
            foo: {

            },
            bar: {
              file: 'hi'
            }
          }
        }
      );

      expect(
        superJson.configHash()
      ).toBe(
        '0113d18696ff6b61237df48d532d07f9'
      );
    });
  });
});
