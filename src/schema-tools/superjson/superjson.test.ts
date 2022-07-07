import type {
  NormalizedUsecaseDefaults,
  ProfileProviderEntry,
  SecurityValues} from '@superfaceai/ast';
import {
  BackoffKind,
  isApiKeySecurityValues,
  isBasicAuthSecurityValues,
  isBearerTokenSecurityValues,
  isDigestSecurityValues,
  isFileURIString,
  isVersionString,
  OnFail
} from '@superfaceai/ast';

import type { IFileSystem, IFileSystemError } from '../../core';
import {
  anonymizeSuperJson,
  hashSuperJson,
} from '../../core/events/reporter/utils';
import { err, ok } from '../../lib';
import { MockEnvironment, MockFileSystem } from '../../mock';
import { NodeCrypto, NodeFileSystem } from '../../node';
import { mergeSecurity } from './mutate';
import * as normalize from './normalize';
import { normalizeSuperJsonDocument } from './normalize';
import { composeFileURI, trimFileURI } from './schema';
import {
  detectSuperJson,
  loadSuperJson,
  loadSuperJsonSync,
  parseSuperJson,
} from './utils';

const environment = new MockEnvironment();

describe('SuperJson', () => {
  let fileSystem: IFileSystem;

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
    fileSystem = MockFileSystem();
    environment.clear();
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
        username: 'digest-user',
        password: 'digest-password',
      };
      expect(isBearerTokenSecurityValues(mockInput)).toEqual(false);
    });
  });

  describe('when checking if input is DigestSecurityValues', () => {
    it('checks digest values input correctly', () => {
      const mockInput = {
        id: 'id',
        username: 'digest-user',
        password: 'digest-password',
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
    it('checks unknown input correctly', () => {
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
      fileSystem.sync.readFile = () => err(mockError as IFileSystemError);
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
      fileSystem.readFile = async () => err(mockError as IFileSystemError);
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

  describe('when normalizing profile provider settings', () => {
    it('returns correct object when entry is undefined', async () => {
      const mockProfileProviderEntry = undefined;
      const mockDefaults: NormalizedUsecaseDefaults = {};

      expect(
        normalize.normalizeProfileProviderSettings(
          mockProfileProviderEntry,
          mockDefaults,
          environment
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
          mockDefaults,
          environment
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
          mockDefaults,
          environment
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
          mockDefaults,
          environment
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
          mockDefaults,
          environment
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

      expect(
        normalize.normalizeProfileSettings(mockProfileEntry, [], environment)
      ).toEqual({
        file: 'some/path',
        priority: [],
        defaults: {},
        providers: {},
      });
    });

    it('returns correct object when entry is version', async () => {
      const mockProfileEntry = '1.0.0';

      expect(
        normalize.normalizeProfileSettings(mockProfileEntry, [], environment)
      ).toEqual({
        version: '1.0.0',
        priority: [],
        defaults: {},
        providers: {},
      });
    });

    it('throws error when entry is unknown string', async () => {
      const mockProfileEntry = 'madeup';
      expect(() =>
        normalize.normalizeProfileSettings(mockProfileEntry, [], environment)
      ).toThrowError(
        new Error('Invalid profile entry format: ' + mockProfileEntry)
      );
    });

    it('returns correct object when entry contains file', async () => {
      const mockProfileEntry = {
        file: 'some/path',
      };

      expect(
        normalize.normalizeProfileSettings(mockProfileEntry, [], environment)
      ).toEqual({
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

      expect(
        normalize.normalizeProviderSettings(mockProviderEntry, environment)
      ).toEqual({
        file: 'some/path',
        security: [],
        parameters: {},
      });
    });

    it('throws error when entry is unknown string', async () => {
      const mockProviderEntry = 'madeup';
      expect(() =>
        normalize.normalizeProviderSettings(mockProviderEntry, environment)
      ).toThrowError(
        new RegExp('Invalid provider entry format: ' + mockProviderEntry)
      );
    });

    it('returns correct object when entry is a object', async () => {
      const envVariable = 'INTEGRATION_PARAMETER_TEST_VARIABLE';
      environment.addValue(envVariable, 'test-value');

      const mockProviderEntry = {
        file: 'some/path',
        security: [],
        parameters: {
          first: 'test',
          second: 'second',
          third: `$${envVariable}`,
        },
      };

      expect(
        normalize.normalizeProviderSettings(mockProviderEntry, environment)
      ).toEqual({
        file: 'some/path',
        security: [],
        parameters: {
          first: 'test',
          second: 'second',
          third: 'test-value',
        },
      });
    });

    it('returns correct object when entry is a object with empty security and parameters', async () => {
      const mockProviderEntry = {
        file: 'some/path',
        security: [],
        parameters: {},
      };

      expect(
        normalize.normalizeProviderSettings(mockProviderEntry, environment)
      ).toEqual({
        file: 'some/path',
        security: [],
        parameters: {},
      });
    });
  });

  describe('when getting normalized super.json', () => {
    it('returns correct object when cache is undefined', async () => {
      const mockSuperJson = {
        providers: {
          test: {},
        },
        profiles: {
          profile: {
            file: 'some/path',
            defaults: {},
          },
        },
      };

      expect(normalizeSuperJsonDocument(mockSuperJson, environment)).toEqual({
        providers: {
          test: {
            file: undefined,
            security: [],
            parameters: {},
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
          composeFileURI(
            '../test/path/to/super.json',
            filesystem.path.normalize
          )
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
            ],
            "parameters":{
              "first": "awesome",
              "second": ""
            }
          }
        }
      }`;

        const doc = parseSuperJson(JSON.parse(superJson)).unwrap();
        expect(normalizeSuperJsonDocument(doc, environment)).toStrictEqual({
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
                        backoff: { kind: BackoffKind.EXPONENTIAL },
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
              parameters: {},
            },
            bar: {
              file: './bar.provider.json',
              security: [],
              parameters: {},
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
              parameters: {
                first: 'awesome',
                second: '',
              },
            },
          },
        });
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
            username: 'right-digest-user',
            password: 'right-digest-password',
          },
        ];

        expect(mergeSecurity(mockLeft, mockRight)).toEqual([
          {
            id: 'left-api-id',
            apikey: 'left-api-key',
          },
          {
            id: 'right-digest-id',
            username: 'right-digest-user',
            password: 'right-digest-password',
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
            username: 'left-digest-user',
            password: 'left-digest-password',
          },
        ];

        const mockRight: SecurityValues[] = [
          {
            id: 'digest-id',
            username: 'right-digest-user',
            password: 'right-digest-password',
          },
        ];

        expect(mergeSecurity(mockLeft, mockRight)).toEqual([
          {
            id: 'left-api-id',
            apikey: 'left-api-key',
          },
          {
            id: 'digest-id',
            username: 'right-digest-user',
            password: 'right-digest-password',
          },
        ]);
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

        expect(await detectSuperJson(process.cwd(), fileSystem)).toEqual(
          mockCwd
        );
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

    // TODO: Proper tests for config hash and anonymization
    describe('when computing config hash', () => {
      it('does debug', () => {
        const superJson = {
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
        };

        const normalized = normalizeSuperJsonDocument(superJson, environment);
        expect(anonymizeSuperJson(normalized)).toEqual({
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

        expect(hashSuperJson(normalized, new NodeCrypto())).toBe(
          'd090f0589a19634c065e903a81006f79'
        );
      });
    });
  });
});
