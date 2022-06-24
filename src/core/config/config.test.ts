import { MockEnvironment } from '~mock';

import { Config } from './config';

describe('Config', () => {
  describe('when loading sdk auth token', () => {
    const environment = new MockEnvironment();

    beforeEach(() => {
      environment.clear();
    });

    it('returns undefined - sdk token not set', async () => {
      const { sdkAuthToken } = Config.loadFromEnv(environment);
      expect(sdkAuthToken).toBeUndefined();
    });

    it('returns undefined - sdk token with invalid prefix', async () => {
      environment.addValue(
        'SUPERFACE_SDK_TOKEN',
        'sfx_bb064dd57c302911602dd097bc29bedaea6a021c25a66992d475ed959aa526c7_37bce8b5'
      );
      const { sdkAuthToken } = Config.loadFromEnv(environment);
      expect(sdkAuthToken).toBeUndefined();
    });

    it('returns undefined - sdk token with invalid sufix', async () => {
      environment.addValue(
        'SUPERFACE_SDK_TOKEN',
        'sfs_bb064dd57c302911602dd097bc29bedaea6a021c25a66992d475ed959aa526c7_37bXe8b5'
      );
      const { sdkAuthToken } = Config.loadFromEnv(environment);
      expect(sdkAuthToken).toBeUndefined();
    });

    it('returns token', async () => {
      const token =
        'sfs_bb064dd57c302911602dd097bc29bedaea6a021c25a66992d475ed959aa526c7_37bce8b5';
      environment.addValue('SUPERFACE_SDK_TOKEN', token);
      const { sdkAuthToken } = Config.loadFromEnv(environment);
      expect(sdkAuthToken).toEqual(token);
    });
  });
});
