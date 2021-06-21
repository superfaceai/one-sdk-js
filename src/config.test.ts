describe('Config', () => {
  describe('when loading sdk auth token', () => {
    let originalToken: string | undefined;

    beforeAll(() => {
      originalToken = process.env.SUPERFACE_SDK_TOKEN;
    });

    afterAll(() => {
      if (originalToken) {
        process.env.SUPERFACE_SDK_TOKEN = originalToken;
      }
    });

    beforeEach(() => {
      jest.resetModules();
    });

    it('returns undefined - sdk token not set', async () => {
      delete process.env.SUPERFACE_SDK_TOKEN;
      const { sdkAuthToken } = (await import('./config')).Config;
      expect(sdkAuthToken).toBeUndefined();
    });

    it('returns undefined - sdk token with invalid prefix', async () => {
      process.env.SUPERFACE_SDK_TOKEN =
        'sfx_bb064dd57c302911602dd097bc29bedaea6a021c25a66992d475ed959aa526c7_37bce8b5';
      const { sdkAuthToken } = (await import('./config')).Config;
      expect(sdkAuthToken).toBeUndefined();
    });

    it('returns undefined - sdk token with invalid sufix', async () => {
      process.env.SUPERFACE_SDK_TOKEN =
        'sfs_bb064dd57c302911602dd097bc29bedaea6a021c25a66992d475ed959aa526c7_37bXe8b5';
      const { sdkAuthToken } = (await import('./config')).Config;
      expect(sdkAuthToken).toBeUndefined();
    });

    it('returns token - sdk token with space at the end', async () => {
      const token =
        'sfs_bb064dd57c302911602dd097bc29bedaea6a021c25a66992d475ed959aa526c7_37bce8b5';
      process.env.SUPERFACE_SDK_TOKEN = token + ' ';
      const { sdkAuthToken } = (await import('./config')).Config;
      expect(sdkAuthToken).toEqual(token);
    });
  });
});
