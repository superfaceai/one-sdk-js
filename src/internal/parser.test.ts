import { parseMap, parseProfile, Source } from '@superfaceai/parser';
import { promises as fsp } from 'fs';

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
  promises: {
    mkdir: jest.fn(),
    stat: jest.fn(),
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

  describe('map', () => {
    afterEach(() => {
      (Parser as any).mapCache = {};
    });

    it("should parse and save to cache when it doesn't exist already", async () => {
      jest.spyOn(fsp, 'stat').mockRejectedValue('File not found');
      const result = await Parser.parseMap(mapFixture, 'profile.supr', {
        profileName: 'profile',
        providerName: 'test-provider',
        scope: 'test',
      });

      expect(fsp.mkdir).toHaveBeenCalled();
      expect(fsp.writeFile).toHaveBeenCalledWith(
        expect.stringMatching('profile'),
        JSON.stringify(result)
      );
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

    it('should load from cache file when already present', async () => {
      jest
        .spyOn(fsp, 'stat')
        .mockResolvedValueOnce({ isFile: () => true } as any);
      jest.spyOn(fsp, 'readFile').mockResolvedValueOnce(mapASTFixture);
      await Parser.parseMap(mapFixture, 'profile.supr', {
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
        .mockResolvedValueOnce([
          'test-provider-abcdef0123456789.suma.ast.json',
        ] as any);
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
        .mockResolvedValueOnce([
          'profile-abcdef0123456789.supr.ast.json',
        ] as any);
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
