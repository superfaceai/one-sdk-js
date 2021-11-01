import { parseMap, parseProfile, Source } from '@superfaceai/parser';
import { promises as fsp } from 'fs';
import { join as joinPath } from 'path';

import { Config } from '../config';
import { Parser } from './parser';

const mapFixture = `
profile = "test/profile@1.2.3"
provider = "test-provider"

map Test {
	map result 7
}
`;
const mapASTFixture = JSON.stringify(parseMap(new Source(mapFixture)));
const mapFixtureChanged = `
profile = "test/profile@1.2.3"
provider = "test-provider"

map Test {
	map result 8
}
`;

const profileFixture = `name = "test/profile"
version = "1.2.3"

usecase Test safe {
  result number
}
`;
const profileASTFixture = JSON.stringify(
  parseProfile(new Source(profileFixture))
);
const profileFixtureChanged = `name = "test/profile"
version = "1.2.4"

usecase Test safe {
  result number
}
`;

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  promises: {
    mkdir: jest.fn(),
    stat: jest.fn(),
    rm: jest.fn(),
    readdir: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    unlink: jest.fn(),
  },
  realpathSync: jest.fn(),
}));

describe('Parser', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('clearCache', () => {
    it('should clear cache', async () => {
      (Parser as any).profileCache = { profilePath: profileASTFixture };
      (Parser as any).mapCache = { mapPath: mapASTFixture };

      await Parser.clearCache();

      expect(Object.keys((Parser as any).profileCache).length).toEqual(0);
      expect(Object.keys((Parser as any).mapCache).length).toEqual(0);

      expect(fsp.rm).toHaveBeenCalledTimes(1);
      expect(fsp.rm).toHaveBeenCalledWith(expect.any(String), {
        recursive: true,
      });
    });
  });

  describe('map', () => {
    afterEach(() => {
      (Parser as any).mapCache = {};
    });

    it("should parse and save to cache when it doesn't exist already", async () => {
      jest.spyOn(fsp, 'stat').mockRejectedValue('File not found');
      const result = await Parser.parseMap(mapFixture, 'map.suma', {
        profileName: 'profile',
        providerName: 'test-provider',
        scope: 'test',
      });

      expect(fsp.mkdir).toHaveBeenCalled();
      expect(fsp.writeFile).toHaveBeenCalledWith(
        expect.stringMatching('test-provider'),
        JSON.stringify(result)
      );
    });

    it('should not load from in-memory cache when already present - missing ast metadata', async () => {
      jest
        .spyOn(fsp, 'stat')
        .mockResolvedValueOnce({ isFile: () => true } as any);
      jest.spyOn(fsp, 'readFile').mockResolvedValueOnce(mapASTFixture);

      const path = joinPath(
        Config.instance().cachePath,
        'test',
        'profile',
        'test-provider.suma.ast.json'
      );

      (Parser as any).mapCache[path] = {
        ...parseMap(new Source(mapFixture)),
        astMetadata: undefined,
      };

      await Parser.parseMap(mapFixture, 'profile.supr', {
        profileName: 'profile',
        providerName: 'test-provider',
        scope: 'test',
      });

      expect(fsp.stat).toHaveBeenCalledTimes(1);
      expect(fsp.readFile).toHaveBeenCalledTimes(1);
      expect(fsp.writeFile).not.toHaveBeenCalled();
    });

    it('should load from in-memory cache when already present', async () => {
      jest
        .spyOn(fsp, 'stat')
        .mockResolvedValueOnce({ isFile: () => true } as any);
      jest.spyOn(fsp, 'readFile').mockResolvedValueOnce(mapASTFixture);
      const result1 = await Parser.parseMap(mapFixture, 'profile.supr', {
        profileName: 'profile',
        providerName: 'test-provider',
        scope: 'test',
      });

      expect(fsp.stat).toHaveBeenCalledTimes(1);
      expect(fsp.readFile).toHaveBeenCalledTimes(1);
      expect(fsp.writeFile).not.toHaveBeenCalled();

      const result2 = await Parser.parseMap(mapFixture, 'profile.supr', {
        profileName: 'profile',
        providerName: 'test-provider',
        scope: 'test',
      });

      expect(fsp.stat).toHaveBeenCalledTimes(1);
      expect(fsp.readFile).toHaveBeenCalledTimes(1);

      expect(result1).toEqual(result2);
    });

    it('should not load from cache file when file is not valid', async () => {
      jest
        .spyOn(fsp, 'stat')
        .mockResolvedValueOnce({ isFile: () => true } as any);
      jest
        .spyOn(fsp, 'readdir')
        .mockResolvedValueOnce(['test-provider.suma.ast.json'] as any);
      jest.spyOn(fsp, 'readFile').mockResolvedValueOnce(
        JSON.stringify({
          ...parseMap(new Source(mapFixture)),
          astMetadata: undefined,
        })
      );
      await Parser.parseMap(mapFixture, 'map.suma', {
        profileName: 'profile',
        providerName: 'test-provider',
        scope: 'test',
      });

      expect(fsp.readFile).toHaveBeenCalled();
      expect(fsp.mkdir).toHaveBeenCalledTimes(1);
      expect(fsp.writeFile).toHaveBeenCalledTimes(1);
      expect(fsp.unlink).toHaveBeenCalled();
    });

    it('should not load from cache file when source checksum does not match', async () => {
      jest
        .spyOn(fsp, 'stat')
        .mockResolvedValueOnce({ isFile: () => true } as any);
      jest
        .spyOn(fsp, 'readdir')
        .mockResolvedValueOnce(['test-provider.suma.ast.json'] as any);

      const ast = parseMap(new Source(mapFixture));
      jest.spyOn(fsp, 'readFile').mockResolvedValueOnce(
        JSON.stringify({
          ...ast,
          astMetadata: { ...ast.astMetadata, sourceChecksum: '' },
        })
      );
      await Parser.parseMap(mapFixture, 'map.suma', {
        profileName: 'profile',
        providerName: 'test-provider',
        scope: 'test',
      });

      expect(fsp.readFile).toHaveBeenCalled();
      expect(fsp.mkdir).toHaveBeenCalledTimes(1);
      expect(fsp.writeFile).toHaveBeenCalledTimes(1);
      expect(fsp.unlink).toHaveBeenCalled();
    });

    it('should load from cache file when already present', async () => {
      jest
        .spyOn(fsp, 'stat')
        .mockResolvedValueOnce({ isFile: () => true } as any);
      jest.spyOn(fsp, 'readFile').mockResolvedValueOnce(mapASTFixture);
      await Parser.parseMap(mapFixture, 'map.suma', {
        profileName: 'profile',
        providerName: 'test-provider',
        scope: 'test',
      });

      expect(fsp.readFile).toHaveBeenCalled();
      expect(fsp.writeFile).not.toHaveBeenCalled();
    });

    it('should recache and delete old files on change', async () => {
      jest.spyOn(fsp, 'stat').mockRejectedValue('File not found');
      jest
        .spyOn(fsp, 'readdir')
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(['test-provider.suma.ast.json'] as any);
      await Parser.parseMap(mapFixture, 'profile.supr', {
        profileName: 'profile',
        providerName: 'test-provider',
        scope: 'test',
      });

      expect(fsp.mkdir).toHaveBeenCalledTimes(1);
      expect(fsp.writeFile).toHaveBeenCalledTimes(1);
      expect(fsp.unlink).not.toHaveBeenCalled();

      await Parser.parseMap(mapFixtureChanged, 'profile.supr', {
        profileName: 'profile',
        providerName: 'test-provider',
        scope: 'test',
      });

      expect(fsp.mkdir).toHaveBeenCalledTimes(2);
      expect(fsp.writeFile).toHaveBeenCalledTimes(2);
      expect(fsp.unlink).toHaveBeenCalled();
    });
  });

  describe('profile', () => {
    afterEach(() => {
      (Parser as any).profileCache = {};
    });

    it("should parse and save to cache when it doesn't exist already", async () => {
      jest.spyOn(fsp, 'stat').mockRejectedValue('File not found');
      const result = await Parser.parseProfile(profileFixture, 'profile.supr', {
        profileName: 'profile',
        scope: 'test',
      });

      expect(fsp.mkdir).toHaveBeenCalled();
      expect(fsp.writeFile).toHaveBeenCalledWith(
        expect.stringMatching('profile'),
        JSON.stringify(result)
      );
    });

    it('should not load from in-memory cache when already present - missing ast metadata', async () => {
      jest
        .spyOn(fsp, 'stat')
        .mockResolvedValueOnce({ isFile: () => true } as any);
      jest.spyOn(fsp, 'readFile').mockResolvedValueOnce(profileASTFixture);

      const path = joinPath(
        Config.instance().cachePath,
        'test',
        'profile.supr.ast.json'
      );

      (Parser as any).profileCache[path] = {
        ...parseProfile(new Source(profileFixture)),
        astMetadata: undefined,
      };

      await Parser.parseProfile(profileFixture, 'profile.supr', {
        profileName: 'profile',
        scope: 'test',
      });

      expect(fsp.stat).toHaveBeenCalledTimes(1);
      expect(fsp.readFile).toHaveBeenCalledTimes(1);
      expect(fsp.writeFile).not.toHaveBeenCalled();
    });

    it('should load from in-memory cache when already present', async () => {
      jest
        .spyOn(fsp, 'stat')
        .mockResolvedValueOnce({ isFile: () => true } as any);
      jest.spyOn(fsp, 'readFile').mockResolvedValueOnce(profileASTFixture);
      const result1 = await Parser.parseProfile(
        profileFixture,
        'profile.supr',
        {
          profileName: 'profile',
          scope: 'test',
        }
      );

      expect(fsp.stat).toHaveBeenCalledTimes(1);
      expect(fsp.readFile).toHaveBeenCalledTimes(1);
      expect(fsp.writeFile).not.toHaveBeenCalled();

      const result2 = await Parser.parseProfile(
        profileFixture,
        'profile.supr',
        {
          profileName: 'profile',
          scope: 'test',
        }
      );

      expect(fsp.stat).toHaveBeenCalledTimes(1);
      expect(fsp.readFile).toHaveBeenCalledTimes(1);

      expect(result1).toEqual(result2);
    });

    it('should not load from cache file when file is not valid', async () => {
      jest
        .spyOn(fsp, 'stat')
        .mockResolvedValueOnce({ isFile: () => true } as any);
      jest
        .spyOn(fsp, 'readdir')
        .mockResolvedValueOnce(['profile.supr.ast.json'] as any);
      jest.spyOn(fsp, 'readFile').mockResolvedValueOnce(
        JSON.stringify({
          ...parseProfile(new Source(profileFixture)),
          astMetadata: undefined,
        })
      );
      await Parser.parseProfile(profileFixture, 'profile.supr', {
        profileName: 'profile',
        scope: 'test',
      });

      expect(fsp.readFile).toHaveBeenCalled();
      expect(fsp.mkdir).toHaveBeenCalledTimes(1);
      expect(fsp.writeFile).toHaveBeenCalledTimes(1);
      expect(fsp.unlink).toHaveBeenCalled();
    });

    it('should not load from cache file when source checksum does not match', async () => {
      jest
        .spyOn(fsp, 'stat')
        .mockResolvedValueOnce({ isFile: () => true } as any);
      jest
        .spyOn(fsp, 'readdir')
        .mockResolvedValueOnce(['profile.supr.ast.json'] as any);

      const ast = parseProfile(new Source(profileFixture));
      jest.spyOn(fsp, 'readFile').mockResolvedValueOnce(
        JSON.stringify({
          ...ast,
          astMetadata: { ...ast.astMetadata, sourceChecksum: '' },
        })
      );
      await Parser.parseProfile(profileFixture, 'profile.supr', {
        profileName: 'profile',
        scope: 'test',
      });

      expect(fsp.readFile).toHaveBeenCalled();
      expect(fsp.mkdir).toHaveBeenCalledTimes(1);
      expect(fsp.writeFile).toHaveBeenCalledTimes(1);
      expect(fsp.unlink).toHaveBeenCalled();
    });

    it('should load from cache file when already present', async () => {
      jest
        .spyOn(fsp, 'stat')
        .mockResolvedValueOnce({ isFile: () => true } as any);
      jest.spyOn(fsp, 'readFile').mockResolvedValueOnce(profileASTFixture);
      await Parser.parseProfile(profileFixture, 'profile.supr', {
        profileName: 'profile',
        scope: 'test',
      });

      expect(fsp.readFile).toHaveBeenCalled();
      expect(fsp.writeFile).not.toHaveBeenCalled();
    });

    it('should recache and delete old files on change', async () => {
      jest.spyOn(fsp, 'stat').mockRejectedValue('File not found');
      jest
        .spyOn(fsp, 'readdir')
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(['profile.supr.ast.json'] as any);
      await Parser.parseProfile(profileFixture, 'profile.supr', {
        profileName: 'profile',
        scope: 'test',
      });

      expect(fsp.mkdir).toHaveBeenCalledTimes(1);
      expect(fsp.writeFile).toHaveBeenCalledTimes(1);
      expect(fsp.unlink).not.toHaveBeenCalled();

      await Parser.parseProfile(profileFixtureChanged, 'profile.supr', {
        profileName: 'profile',
        scope: 'test',
      });

      expect(fsp.mkdir).toHaveBeenCalledTimes(2);
      expect(fsp.writeFile).toHaveBeenCalledTimes(2);
      expect(fsp.unlink).toHaveBeenCalled();
    });
  });
});
