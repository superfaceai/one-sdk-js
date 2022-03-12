import { parseMap, parseProfile, Source } from '@superfaceai/parser';

import { MockFileSystem } from '../test/filesystem';
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

const cachePath = 'test';

describe('Parser', () => {
  let filesystem: typeof MockFileSystem;

  beforeEach(() => {
    filesystem = { ...MockFileSystem };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('clearCache', () => {
    it('should clear in memory and file cache', async () => {
      (Parser as any).profileCache = { profilePath: profileASTFixture };
      (Parser as any).mapCache = { mapPath: mapASTFixture };

      filesystem.isAccessible = jest.fn().mockResolvedValue(true);

      await Parser.clearCache(cachePath, filesystem);

      expect(Object.keys((Parser as any).profileCache).length).toEqual(0);
      expect(Object.keys((Parser as any).mapCache).length).toEqual(0);

      expect(filesystem.rm).toHaveBeenCalledTimes(1);
      expect(filesystem.rm).toHaveBeenCalledWith(expect.any(String), {
        recursive: true,
      });
    });

    it('should clear in memory cache', async () => {
      (Parser as any).profileCache = { profilePath: profileASTFixture };
      (Parser as any).mapCache = { mapPath: mapASTFixture };

      filesystem.isAccessible = jest.fn().mockResolvedValue(false);

      await Parser.clearCache(cachePath, filesystem);

      expect(Object.keys((Parser as any).profileCache).length).toEqual(0);
      expect(Object.keys((Parser as any).mapCache).length).toEqual(0);

      expect(filesystem.rm).not.toHaveBeenCalled();
    });
  });

  describe('map', () => {
    afterEach(() => {
      (Parser as any).mapCache = {};
    });

    it("should parse and save to cache when it doesn't exist already", async () => {
      filesystem.exists = jest.fn().mockResolvedValue(false);
      const result = await Parser.parseMap(
        mapFixture,
        'map.suma',
        {
          profileName: 'profile',
          providerName: 'test-provider',
          scope: 'test',
        },
        cachePath,
        filesystem
      );
      expect(filesystem.mkdir).toHaveBeenCalled();
      expect(filesystem.writeFile).toHaveBeenCalledWith(
        expect.stringMatching('test-provider'),
        JSON.stringify(result)
      );
    });

    it('should not load from in-memory cache when already present - missing ast metadata', async () => {
      filesystem.exists = jest.fn().mockResolvedValue(true);
      filesystem.readFile = jest.fn().mockResolvedValueOnce(mapASTFixture);
      const path = filesystem.joinPath(
        cachePath,
        'test',
        'profile',
        'test-provider.suma.ast.json'
      );
      (Parser as any).mapCache[path] = {
        ...parseMap(new Source(mapFixture)),
        astMetadata: undefined,
      };
      await Parser.parseMap(
        mapFixture,
        'profile.supr',
        {
          profileName: 'profile',
          providerName: 'test-provider',
          scope: 'test',
        },
        cachePath,
        filesystem
      );
      expect(filesystem.readFile).toHaveBeenCalledTimes(1);
      expect(filesystem.writeFile).not.toHaveBeenCalled();
    });

    it('should load from in-memory cache when already present', async () => {
      filesystem.exists = jest.fn().mockResolvedValue(true);
      filesystem.readFile = jest.fn().mockResolvedValueOnce(mapASTFixture);
      const result1 = await Parser.parseMap(
        mapFixture,
        'profile.supr',
        {
          profileName: 'profile',
          providerName: 'test-provider',
          scope: 'test',
        },
        cachePath,
        filesystem
      );
      expect(filesystem.readFile).toHaveBeenCalledTimes(1);
      expect(filesystem.writeFile).not.toHaveBeenCalled();
      const result2 = await Parser.parseMap(
        mapFixture,
        'profile.supr',
        {
          profileName: 'profile',
          providerName: 'test-provider',
          scope: 'test',
        },
        cachePath,
        filesystem
      );
      expect(filesystem.readFile).toHaveBeenCalledTimes(1);
      expect(result1).toEqual(result2);
    });

    it('should not load from cache file when file is not valid', async () => {
      filesystem.exists = jest.fn().mockResolvedValue(true);
      filesystem.readdir = jest
        .fn()
        .mockResolvedValueOnce(['test-provider.suma.ast.json']);
      filesystem.readFile = jest.fn().mockResolvedValueOnce(
        JSON.stringify({
          ...parseMap(new Source(mapFixture)),
          astMetadata: undefined,
        })
      );
      await Parser.parseMap(
        mapFixture,
        'map.suma',
        {
          profileName: 'profile',
          providerName: 'test-provider',
          scope: 'test',
        },
        cachePath,
        filesystem
      );
      expect(filesystem.readFile).toHaveBeenCalled();
      expect(filesystem.mkdir).toHaveBeenCalledTimes(1);
      expect(filesystem.writeFile).toHaveBeenCalledTimes(1);
      expect(filesystem.rm).toHaveBeenCalled();
    });

    it('should not load from cache file when source checksum does not match', async () => {
      filesystem.readdir = jest
        .fn()
        .mockResolvedValueOnce(['test-provider.suma.ast.json']);
      const ast = parseMap(new Source(mapFixture));
      filesystem.exists = jest.fn().mockResolvedValue(true);
      filesystem.readFile = jest.fn().mockResolvedValueOnce(
        JSON.stringify({
          ...ast,
          astMetadata: { ...ast.astMetadata, sourceChecksum: '' },
        })
      );
      await Parser.parseMap(
        mapFixture,
        'map.suma',
        {
          profileName: 'profile',
          providerName: 'test-provider',
          scope: 'test',
        },
        cachePath,
        filesystem
      );
      expect(filesystem.readFile).toHaveBeenCalled();
      expect(filesystem.mkdir).toHaveBeenCalledTimes(1);
      expect(filesystem.writeFile).toHaveBeenCalledTimes(1);
      expect(filesystem.rm).toHaveBeenCalled();
    });

    it('should load from cache file when already present', async () => {
      filesystem.exists = jest.fn().mockResolvedValue(true);
      filesystem.readFile = jest.fn().mockResolvedValueOnce(mapASTFixture);
      await Parser.parseMap(
        mapFixture,
        'map.suma',
        {
          profileName: 'profile',
          providerName: 'test-provider',
          scope: 'test',
        },
        cachePath,
        filesystem
      );
      expect(filesystem.readFile).toHaveBeenCalled();
      expect(filesystem.writeFile).not.toHaveBeenCalled();
    });

    it('should recache and delete old files on change', async () => {
      filesystem.exists = jest.fn().mockResolvedValue(false);
      filesystem.readFile = jest.fn().mockResolvedValueOnce(mapASTFixture);
      filesystem.readdir = jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(['test-provider.suma.ast.json']);

      await Parser.parseMap(
        mapFixture,
        'profile.supr',
        {
          profileName: 'profile',
          providerName: 'test-provider',
          scope: 'test',
        },
        cachePath,
        filesystem
      );

      expect(filesystem.mkdir).toHaveBeenCalledTimes(1);
      expect(filesystem.writeFile).toHaveBeenCalledTimes(1);
      expect(filesystem.rm).not.toHaveBeenCalled();
      await Parser.parseMap(
        mapFixtureChanged,
        'profile.supr',
        {
          profileName: 'profile',
          providerName: 'test-provider',
          scope: 'test',
        },
        cachePath,
        filesystem
      );
      expect(filesystem.mkdir).toHaveBeenCalledTimes(2);
      expect(filesystem.writeFile).toHaveBeenCalledTimes(2);
      expect(filesystem.rm).toHaveBeenCalled();
    });
  });

  describe('profile', () => {
    afterEach(() => {
      (Parser as any).profileCache = {};
    });

    it("should parse and save to cache when it doesn't exist already", async () => {
      // jest.spyOn(fsp, 'stat').mockRejectedValue('File not found');
      filesystem.exists = jest.fn().mockResolvedValue(false);
      const result = await Parser.parseProfile(
        profileFixture,
        'profile.supr',
        {
          profileName: 'profile',
          scope: 'test',
        },
        cachePath,
        filesystem
      );
      expect(filesystem.mkdir).toHaveBeenCalled();
      expect(filesystem.writeFile).toHaveBeenCalledWith(
        expect.stringMatching('profile'),
        JSON.stringify(result)
      );
    });

    it('should not load from in-memory cache when already present - missing ast metadata', async () => {
      filesystem.exists = jest.fn().mockResolvedValueOnce(true);
      filesystem.readFile = jest.fn().mockResolvedValueOnce(profileASTFixture);
      const path = filesystem.joinPath(
        cachePath,
        'test',
        'profile.supr.ast.json'
      );
      (Parser as any).profileCache[path] = {
        ...parseProfile(new Source(profileFixture)),
        astMetadata: undefined,
      };
      await Parser.parseProfile(
        profileFixture,
        'profile.supr',
        {
          profileName: 'profile',
          scope: 'test',
        },
        cachePath,
        filesystem
      );
      expect(filesystem.exists).toHaveBeenCalledTimes(1);
      expect(filesystem.readFile).toHaveBeenCalledTimes(1);
      expect(filesystem.writeFile).not.toHaveBeenCalled();
    });

    it('should load from in-memory cache when already present', async () => {
      filesystem.exists = jest.fn().mockResolvedValueOnce(true);
      filesystem.readFile = jest.fn().mockResolvedValueOnce(profileASTFixture);
      const result1 = await Parser.parseProfile(
        profileFixture,
        'profile.supr',
        {
          profileName: 'profile',
          scope: 'test',
        },
        cachePath,
        filesystem
      );
      expect(filesystem.exists).toHaveBeenCalledTimes(1);
      expect(filesystem.readFile).toHaveBeenCalledTimes(1);
      expect(filesystem.writeFile).not.toHaveBeenCalled();
      const result2 = await Parser.parseProfile(
        profileFixture,
        'profile.supr',
        {
          profileName: 'profile',
          scope: 'test',
        },
        cachePath,
        filesystem
      );
      expect(filesystem.exists).toHaveBeenCalledTimes(1);
      expect(filesystem.readFile).toHaveBeenCalledTimes(1);
      expect(result1).toEqual(result2);
    });

    it('should not load from cache file when file is not valid', async () => {
      filesystem.exists = jest.fn().mockResolvedValueOnce(true);
      filesystem.readdir = jest
        .fn()
        .mockResolvedValueOnce(['profile.supr.ast.json']);

      filesystem.readFile = jest.fn().mockResolvedValueOnce(
        JSON.stringify({
          ...parseProfile(new Source(profileFixture)),
          astMetadata: undefined,
        })
      );
      await Parser.parseProfile(
        profileFixture,
        'profile.supr',
        {
          profileName: 'profile',
          scope: 'test',
        },
        cachePath,
        filesystem
      );
      expect(filesystem.readFile).toHaveBeenCalled();
      expect(filesystem.mkdir).toHaveBeenCalledTimes(1);
      expect(filesystem.writeFile).toHaveBeenCalledTimes(1);
      expect(filesystem.rm).toHaveBeenCalled();
    });

    it('should not load from cache file when source checksum does not match', async () => {
      filesystem.exists = jest.fn().mockResolvedValueOnce(true);
      filesystem.readdir = jest
        .fn()
        .mockResolvedValueOnce(['profile.supr.ast.json']);
      const ast = parseProfile(new Source(profileFixture));
      filesystem.readFile = jest.fn().mockResolvedValueOnce(
        JSON.stringify({
          ...ast,
          astMetadata: { ...ast.astMetadata, sourceChecksum: '' },
        })
      );
      await Parser.parseProfile(
        profileFixture,
        'profile.supr',
        {
          profileName: 'profile',
          scope: 'test',
        },
        cachePath,
        filesystem
      );
      expect(filesystem.readFile).toHaveBeenCalled();
      expect(filesystem.mkdir).toHaveBeenCalledTimes(1);
      expect(filesystem.writeFile).toHaveBeenCalledTimes(1);
      expect(filesystem.rm).toHaveBeenCalled();
    });

    it('should load from cache file when already present', async () => {
      filesystem.exists = jest.fn().mockResolvedValueOnce(true);
      filesystem.readFile = jest.fn().mockResolvedValueOnce(profileASTFixture);
      await Parser.parseProfile(
        profileFixture,
        'profile.supr',
        {
          profileName: 'profile',
          scope: 'test',
        },
        cachePath,
        filesystem
      );
      expect(filesystem.readFile).toHaveBeenCalled();
      expect(filesystem.writeFile).not.toHaveBeenCalled();
    });

    it('should recache and delete old files on change', async () => {
      filesystem.exists = jest.fn().mockResolvedValue(false);
      filesystem.readdir = jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(['profile.supr.ast.json']);

      await Parser.parseProfile(
        profileFixture,
        'profile.supr',
        {
          profileName: 'profile',
          scope: 'test',
        },
        cachePath,
        filesystem
      );
      expect(filesystem.mkdir).toHaveBeenCalledTimes(1);
      expect(filesystem.writeFile).toHaveBeenCalledTimes(1);
      expect(filesystem.rm).not.toHaveBeenCalled();
      await Parser.parseProfile(
        profileFixtureChanged,
        'profile.supr',
        {
          profileName: 'profile',
          scope: 'test',
        },
        cachePath,
        filesystem
      );
      expect(filesystem.mkdir).toHaveBeenCalledTimes(2);
      expect(filesystem.writeFile).toHaveBeenCalledTimes(2);
      expect(filesystem.rm).toHaveBeenCalled();
    });
  });
});
