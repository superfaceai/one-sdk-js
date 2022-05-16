import { promises } from 'fs';
import { join as joinPath } from 'path';

import { DEFAULT_SUPERFACE_PATH } from '../../config';
import { SuperJson } from './superjson';

const { unlink, rmdir, mkdir, writeFile } = promises;
const basedir = process.cwd();

describe('class SuperJson integration tests', () => {
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
          "security": [
            {
              "id": "myApiKey",
              "apikey": "SECRET"
            }
          ]
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
      const result = await SuperJson.load(
        DEFAULT_SUPERFACE_PATH({ path: { join: joinPath } })
      );
      expect(result.isOk()).toBe(true);
    });
  });
});
