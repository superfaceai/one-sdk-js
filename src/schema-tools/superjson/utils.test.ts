import type { FileSystemError } from '../../core';
import type { IFileSystem } from '../../interfaces';
import { err, ok } from '../../lib';
import { MockFileSystem } from '../../mock';
import { NodeFileSystem } from '../../node';
import {
  composeFileURI,
  detectSuperJson,
  loadSuperJson,
  loadSuperJsonSync,
  parseSuperJson,
  trimFileURI,
} from './utils';

const mockSuperJsonDocument = {
  profiles: {
    test: {
      defaults: { input: { input: { test: 'test' } } },
      file: 'some/path',
      providers: {},
    },
  },
};

describe('SuperJson utils', () => {
  let fileSystem: IFileSystem;

  beforeEach(() => {
    fileSystem = MockFileSystem();
  });

  describe('when loading super.json synchronously', () => {
    const mockError = new Error('test');

    it('returns err when unable to find super.json', () => {
      fileSystem.sync.isAccessible = () => false;
      const result = loadSuperJsonSync('test', fileSystem);
      expect(result.isErr()).toBe(true);
      expect(result.isErr() && result.error.message).toMatch(
        'Unable to find super.json'
      );
    });

    it('returns err when super.json is not file', () => {
      fileSystem.sync.isFile = () => false;
      const result = loadSuperJsonSync('test', fileSystem);
      expect(result.isErr()).toBe(true);
      expect(result.isErr() && result.error.message).toMatch(
        '"test" is not a file'
      );
    });

    it('returns err when unable to read super.json', () => {
      fileSystem.sync.readFile = () => err(mockError as FileSystemError);
      const result = loadSuperJsonSync('test', fileSystem);
      expect(result.isErr()).toBe(true);
      expect(result.isErr() && result.error.message).toMatch(
        'Unable to read super.json\n\nError: test'
      );
    });

    it('returns err when there is an error during parsing super.json', () => {
      fileSystem.sync.readFile = () =>
        ok(`{
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
      expect(loadSuperJsonSync('test', fileSystem).isErr()).toEqual(true);
    });

    it('returns err when there is an error during parsing super.json - usecase not nested under defaults', () => {
      fileSystem.sync.readFile = () =>
        ok(`{
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
      expect(loadSuperJsonSync('test', fileSystem).isErr()).toEqual(true);
    });

    it('returns new super.json', () => {
      fileSystem.sync.readFile = () =>
        ok(JSON.stringify(mockSuperJsonDocument));

      expect(loadSuperJsonSync('test', fileSystem)).toEqual(
        ok(mockSuperJsonDocument)
      );
    });
  });

  describe('when loading super.json asynchronously', () => {
    const mockError = new Error('test');

    it('returns err when unable to find super.json', async () => {
      fileSystem.isAccessible = async () => false;
      const result = await loadSuperJson('test', fileSystem);
      expect(result.isErr()).toBe(true);
      expect(result.isErr() && result.error.message).toMatch(
        'super.json not found in "test"'
      );
    });

    it('returns err when super.json is not file', async () => {
      fileSystem.isFile = async () => false;
      const result = await loadSuperJson('test', fileSystem);
      expect(result.isErr()).toBe(true);
      expect(result.isErr() && result.error.message).toMatch(
        '"test" is not a file'
      );
    });

    it('returns err when unable to read super.json', async () => {
      fileSystem.readFile = async () => err(mockError as FileSystemError);
      const result = await loadSuperJson('test', fileSystem);
      expect(result.isErr()).toBe(true);
      expect(result.isErr() && result.error.message).toMatch(
        'Unable to read super.json'
      );
    });

    it('returns err when there is an error during parsing super.json', async () => {
      fileSystem.readFile = async () =>
        ok(`{
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
      expect((await loadSuperJson('test', fileSystem)).isErr()).toEqual(true);
    });

    it('returns new super.json', async () => {
      fileSystem.readFile = async () =>
        ok(JSON.stringify(mockSuperJsonDocument));

      await expect(loadSuperJson('test', fileSystem)).resolves.toEqual(
        ok(mockSuperJsonDocument)
      );
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
    const filesystem = NodeFileSystem;

    it('return path without change', () => {
      expect(
        composeFileURI(
          'file://test/path/to/super.json',
          filesystem.path.normalize
        )
      ).toEqual('file://test/path/to/super.json');
    });

    it('return path with file://../', () => {
      expect(
        composeFileURI('../test/path/to/super.json', filesystem.path.normalize)
      ).toEqual('file://../test/path/to/super.json');
    });

    it('return path with file://', () => {
      expect(
        composeFileURI('test/path/to/super.json', filesystem.path.normalize)
      ).toEqual('file://./test/path/to/super.json');
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
      expect(parseSuperJson(JSON.parse(superJson)).isOk()).toBe(true);
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
                "username": "digest-user",
                "password": "digest-password"
              }
            ]
          },
          "twillio": {
            "security": []
          }
        }
      }`;
      expect(parseSuperJson(JSON.parse(superJson)).isOk()).toBe(true);
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
      expect(parseSuperJson(JSON.parse(superJson)).isErr()).toBe(true);
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
      expect(parseSuperJson(JSON.parse(superJson)).isErr()).toBe(true);
    });

    it('returns error invalid document', () => {
      const superJson = '"hello"';
      expect(parseSuperJson(JSON.parse(superJson)).isErr()).toBe(true);
    });
  });

  describe('when detecting super json', () => {
    it('detects super.json in cwd', async () => {
      const mockCwd = 'path/to/';

      fileSystem.path.relative = () => mockCwd;
      expect(await detectSuperJson(mockCwd, fileSystem)).toEqual(mockCwd);
    });

    it('detects super.json from 1 level above', async () => {
      const mockCwd = 'path/to/';

      fileSystem.isAccessible = jest
        .fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValue(true);
      fileSystem.path.relative = () => mockCwd;

      expect(await detectSuperJson(process.cwd(), fileSystem)).toEqual(mockCwd);
    });

    it('does not detect super.json from 2 levels above', async () => {
      const mockCwd = 'path/to/';

      fileSystem.isAccessible = async () => false;
      fileSystem.path.relative = () => mockCwd;

      expect(await detectSuperJson(mockCwd, fileSystem)).toBeUndefined();
    });

    it('detects super.json from 1 level below', async () => {
      const mockCwd = 'path/to/';
      fileSystem.path.relative = () => mockCwd;
      fileSystem.isAccessible = jest
        .fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true)
        .mockResolvedValue(true);

      expect(await detectSuperJson(mockCwd, fileSystem, 1)).toEqual(mockCwd);
    });

    it('detects super.json from 2 levels below', async () => {
      const mockCwd = 'path/to/';
      fileSystem.path.relative = () => mockCwd;

      fileSystem.isAccessible = jest
        .fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      expect(await detectSuperJson(mockCwd, fileSystem, 2)).toEqual(mockCwd);
    });
  });
});
