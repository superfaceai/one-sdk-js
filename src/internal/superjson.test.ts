import { promises } from 'fs';
import { join as joinPath } from 'path';

import {
  isFileURIString,
  isVersionString,
  loadSuperJSON,
  parseSuperJSON,
} from './superjson';

const { unlink, rmdir, mkdir, writeFile } = promises;
const basedir = process.cwd();

describe('SuperJSONDocument', () => {
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
      expect(() => parseSuperJSON(JSON.parse(superJson))).not.toThrow();
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
                "username": "johndoe",
                "password": "$SF_SWAPIDEW_BASICAUTH_PASSWORD"
              }
            }
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
      expect(() => parseSuperJSON(JSON.parse(superJson))).not.toThrow();
    }
  });

  it('throws on invalid document', () => {
    {
      const superJson = `{ invalid: json }`;
      expect(() => parseSuperJSON(JSON.parse(superJson))).toThrow();
    }
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
      expect(() => parseSuperJSON(JSON.parse(superJson))).toThrow();
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
                "type": "apikey",
                "value": "SECRET",
                "in": "header",
                "field": "x-api-key"
              }
            }
          }
        }
      }`;
      expect(() => parseSuperJSON(JSON.parse(superJson))).toThrow();
    }
    {
      const superJson = `"hello"`;
      expect(() => parseSuperJSON(JSON.parse(superJson))).toThrow();
    }
  });

  it('returns undefined when super.json does not exist', async () => {
    const result = await loadSuperJSON();
    expect(result).toBeUndefined();
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
      const result = await loadSuperJSON();
      expect(result).toBeTruthy();
    });
  });

  it('checks version string validity', () => {
    expect(isVersionString('1.0.0')).toBe(true);
    expect(isVersionString('0.0.0')).toBe(true);
    expect(isVersionString('1.0')).toBe(false);
    expect(isVersionString('1')).toBe(false);
    expect(isVersionString('^1.0.0')).toBe(false);
    expect(isVersionString('hippopotamus')).toBe(false);
    expect(isVersionString(true)).toBe(false);
  });

  it('checks file URI string validity', () => {
    expect(isFileURIString('file:../superface.suma')).toBe(true);
    expect(isFileURIString('file:/superface.suma')).toBe(true);
    expect(isFileURIString('file:superface.suma')).toBe(true);
    expect(isFileURIString('a banana daiquiri')).toBe(false);
    expect(isFileURIString(false)).toBe(false);
  });
});
