import { promises } from 'fs';
import { join as joinPath } from 'path';

import { isFileURIString, isVersionString, SuperJson } from './superjson';

const { unlink, rmdir, mkdir, writeFile } = promises;
const basedir = process.cwd();

describe('class SuperJson', () => {
  it('parses valid super.json', () => {
    {
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
            "auth": {
              "ApiKey": {
                "type": "apikey",
                "value": "SECRET",
                "in": "header",
                "header": "x-api-key"
              }
            }
          }
        }
      }`;
      expect(SuperJson.parse(JSON.parse(superJson)).isOk()).toBe(true);
    }
    {
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
            "auth": {
              "BasicAuth": {
                "type": "http",
                "scheme": "basic",
                "username": "johndoe",
                "password": "$SF_SWAPIDEW_BASICAUTH_PASSWORD"
              },
              "ApiKey": {
                "type": "apikey",
                "value": "SECRET",
                "in": "header",
                "header": "x-api-key"
              },
              "CustomScheme": {
                "type": "digest",
                "value": "SECRET"
              }
            }
          },
          "twillio": {
            "auth": {}
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
    }
  });

  it('returns error on invalid document', () => {
    {
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
            "auth": {
              "ApiKey": {
                "type": "apikey",
                "value": "SECRET",
                "in": "header",
                "header": "x-api-key"
              }
            }
          }
        }
      }`;
      expect(SuperJson.parse(JSON.parse(superJson)).isErr()).toBe(true);
    }
    {
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
            "auth": {
              "ApiKey": {
                "type": "http",
                "value": "SECRET",
                "in": "header",
                "field": "x-api-key"
              },
              "Digest": {
                "type": "http",
                "scheme": "basic",
                "value": "SECRET"
              }
            }
          }
        }
      }`;
      expect(SuperJson.parse(JSON.parse(superJson)).isErr()).toBe(true);
    }
    {
      const superJson = `"hello"`;
      expect(SuperJson.parse(JSON.parse(superJson)).isErr()).toBe(true);
    }
  });

  it('returns error when super.json does not exist', async () => {
    const result = await SuperJson.load();
    expect(result.isErr()).toBe(true);
  });

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
          "auth": {}
        },
        "baz": {
          "auth": {
            "BasicAuth": {
              "type": "http",
              "scheme": "basic",
              "username": "hi",
              "password": "heya"
            }
          }
        }
      }
    }`;

    const doc = new SuperJson(SuperJson.parse(JSON.parse(superJson)).unwrap());
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
          auth: {},
        },
        bar: {
          file: './bar.provider.json',
          auth: {},
        },
        baz: {
          file: undefined,
          auth: {
            BasicAuth: {
              type: 'http',
              scheme: 'basic',
              username: 'hi',
              password: 'heya',
            },
          },
        },
      },
    });
  });

  describe('super.json present', () => {
    beforeEach(async () => {
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
          "auth": {
            "ApiKey": {
              "type": "apikey",
              "value": "SECRET",
              "in": "header",
              "header": "x-api-key"
            }
          }
        }
      }
    }`;

      await mkdir(joinPath(basedir, 'superface'));
      await writeFile(joinPath(basedir, 'superface', 'super.json'), superJson);
    });

    afterEach(async () => {
      await unlink(joinPath(basedir, 'superface', 'super.json'));
      await rmdir(joinPath(basedir, 'superface'));
    });

    it('correctly parses super.json when it is present', async () => {
      const result = await SuperJson.load();
      expect(result.isOk()).toBe(true);
    });
  });

  it('checks version string validity', () => {
    expect(isVersionString('1.0.0')).toBe(true);
    expect(isVersionString('0.0.0')).toBe(true);
    expect(isVersionString('1.0')).toBe(false);
    expect(isVersionString('1')).toBe(false);
    expect(isVersionString('^1.0.0')).toBe(false);
    expect(isVersionString('hippopotamus')).toBe(false);
  });

  it('checks file URI string validity', () => {
    expect(isFileURIString('file://../superface.suma')).toBe(true);
    expect(isFileURIString('file:///superface.suma')).toBe(true);
    expect(isFileURIString('file://superface.suma')).toBe(true);
    expect(isFileURIString('a banana daiquiri')).toBe(false);
  });
});
