import { Config } from './config';

describe('Config', () => {
  describe('when setting sdk auth token', () => {
    it('throws error - sdk token with invalid prefix', async () => {
      const token =
        'sfx_bb064dd57c302911602dd097bc29bedaea6a021c25a66992d475ed959aa526c7_37bce8b5';
      expect(() => Config.setSdkAuthToken(token)).toThrowError(
        new Error(`${token} is not valid Superface authentication token.`)
      );
    });

    it('returns undefined - sdk token with invalid sufix', async () => {
      const token =
        'sfs_bb064dd57c302911602dd097bc29bedaea6a021c25a66992d475ed959aa526c7_37bXe8b5';
      expect(() => Config.setSdkAuthToken(token)).toThrowError(
        new Error(`${token} is not valid Superface authentication token.`)
      );
    });

    it('sets token - sdk token with space at the end', async () => {
      const token =
        'sfs_bb064dd57c302911602dd097bc29bedaea6a021c25a66992d475ed959aa526c7_37bce8b5';
      Config.setSdkAuthToken(token + '  ');
      expect(Config.instance().sdkAuthToken).toEqual(token);
    });
  });
  describe('when loading sdk auth token', () => {
    let originalToken: string | undefined;

    beforeAll(() => {
      originalToken = process.env.SUPERFACE_SDK_TOKEN;
    });

    afterAll(() => {
      if (originalToken) {
        process.env.SUPERFACE_SDK_TOKEN = originalToken;
      }
      Config.reloadFromEnv();
    });

    beforeEach(() => {
      jest.resetModules();
    });

    it('returns undefined - sdk token not set', async () => {
      delete process.env.SUPERFACE_SDK_TOKEN;
      const { sdkAuthToken } = Config.reloadFromEnv();
      expect(sdkAuthToken).toBeUndefined();
    });

    it('returns undefined - sdk token with invalid prefix', async () => {
      process.env.SUPERFACE_SDK_TOKEN =
        'sfx_bb064dd57c302911602dd097bc29bedaea6a021c25a66992d475ed959aa526c7_37bce8b5';
      const { sdkAuthToken } = Config.reloadFromEnv();
      expect(sdkAuthToken).toBeUndefined();
    });

    it('returns undefined - sdk token with invalid sufix', async () => {
      process.env.SUPERFACE_SDK_TOKEN =
        'sfs_bb064dd57c302911602dd097bc29bedaea6a021c25a66992d475ed959aa526c7_37bXe8b5';
      const { sdkAuthToken } = Config.reloadFromEnv();
      expect(sdkAuthToken).toBeUndefined();
    });

    it('returns token - sdk token with space at the end', async () => {
      const token =
        'sfs_bb064dd57c302911602dd097bc29bedaea6a021c25a66992d475ed959aa526c7_37bce8b5';
      process.env.SUPERFACE_SDK_TOKEN = token + ' ';
      const { sdkAuthToken } = Config.reloadFromEnv();
      expect(sdkAuthToken).toEqual(token);
    });
  });
});
