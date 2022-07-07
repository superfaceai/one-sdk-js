import type {
  NormalizedUsecaseDefaults,
  ProfileProviderEntry,
} from '@superfaceai/ast';
import {
  BackoffKind,
  isFileURIString,
  isVersionString,
  OnFail,
} from '@superfaceai/ast';

import { MockEnvironment } from '../../mock';
import {
  normalizeProfileProviderSettings,
  normalizeProfileSettings,
  normalizeProviderSettings,
  normalizeSuperJsonDocument,
} from './normalize';
import { parseSuperJson } from './utils';

const environment = new MockEnvironment();

describe('SuperJson normalization', () => {
  beforeEach(() => {
    environment.clear();
  });

  describe('when normalizing profile provider settings', () => {
    it('returns correct object when entry is undefined', async () => {
      const mockProfileProviderEntry = undefined;
      const mockDefaults: NormalizedUsecaseDefaults = {};

      expect(
        normalizeProfileProviderSettings(
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
        normalizeProfileProviderSettings(
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
        normalizeProfileProviderSettings(
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
        normalizeProfileProviderSettings(
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
        normalizeProfileProviderSettings(
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
        normalizeProfileSettings(mockProfileEntry, [], environment)
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
        normalizeProfileSettings(mockProfileEntry, [], environment)
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
        normalizeProfileSettings(mockProfileEntry, [], environment)
      ).toThrowError(
        new Error('Invalid profile entry format: ' + mockProfileEntry)
      );
    });

    it('returns correct object when entry contains file', async () => {
      const mockProfileEntry = {
        file: 'some/path',
      };

      expect(
        normalizeProfileSettings(mockProfileEntry, [], environment)
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

      expect(normalizeProviderSettings(mockProviderEntry, environment)).toEqual(
        {
          file: 'some/path',
          security: [],
          parameters: {},
        }
      );
    });

    it('throws error when entry is unknown string', async () => {
      const mockProviderEntry = 'madeup';
      expect(() =>
        normalizeProviderSettings(mockProviderEntry, environment)
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

      expect(normalizeProviderSettings(mockProviderEntry, environment)).toEqual(
        {
          file: 'some/path',
          security: [],
          parameters: {
            first: 'test',
            second: 'second',
            third: 'test-value',
          },
        }
      );
    });

    it('returns correct object when entry is a object with empty security and parameters', async () => {
      const mockProviderEntry = {
        file: 'some/path',
        security: [],
        parameters: {},
      };

      expect(normalizeProviderSettings(mockProviderEntry, environment)).toEqual(
        {
          file: 'some/path',
          security: [],
          parameters: {},
        }
      );
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
  });
});
