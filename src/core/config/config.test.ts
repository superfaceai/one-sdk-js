import { MockEnvironment } from '../../mock';
import { NodeFileSystem } from '../../node';
import {
  Config,
  loadConfigFromCode,
  loadConfigFromEnv,
  mergeConfigs,
} from './config';

describe('Config', () => {
  describe('when loading sdk auth token', () => {
    const environment = new MockEnvironment();

    beforeEach(() => {
      environment.clear();
    });

    it('returns undefined - sdk token not set', async () => {
      const { sdkAuthToken } = loadConfigFromEnv(environment, NodeFileSystem);
      expect(sdkAuthToken).toBeUndefined();
    });

    it('returns undefined - sdk token with invalid prefix', async () => {
      environment.addValue(
        'SUPERFACE_SDK_TOKEN',
        'sfx_bb064dd57c302911602dd097bc29bedaea6a021c25a66992d475ed959aa526c7_37bce8b5'
      );
      const { sdkAuthToken } = loadConfigFromEnv(environment, NodeFileSystem);
      expect(sdkAuthToken).toBeUndefined();
    });

    it('returns undefined - sdk token with invalid sufix', async () => {
      environment.addValue(
        'SUPERFACE_SDK_TOKEN',
        'sfs_bb064dd57c302911602dd097bc29bedaea6a021c25a66992d475ed959aa526c7_37bXe8b5'
      );
      const { sdkAuthToken } = loadConfigFromEnv(environment, NodeFileSystem);
      expect(sdkAuthToken).toBeUndefined();
    });

    it('returns token', async () => {
      const token =
        'sfs_bb064dd57c302911602dd097bc29bedaea6a021c25a66992d475ed959aa526c7_37bce8b5';
      environment.addValue('SUPERFACE_SDK_TOKEN', token);
      const { sdkAuthToken } = loadConfigFromEnv(environment, NodeFileSystem);
      expect(sdkAuthToken).toEqual(token);
    });
  });

  describe('when merging two configs', () => {
    it('returns config with values from new config', async () => {
      expect(
        mergeConfigs(
          new Config(NodeFileSystem, {
            disableReporting: true,
            metricDebounceTimeMax: 100,
            metricDebounceTimeMin: 10,
            sandboxTimeout: 1,
            sdkAuthToken: 'old',
            superfaceApiUrl: 'https://superface.ai/old',
            superfaceCacheTimeout: 3,
            superfacePath: '/Users/someone/old/super.json',
          }),
          new Config(NodeFileSystem, {
            disableReporting: false,
            metricDebounceTimeMax: 1000,
            metricDebounceTimeMin: 100,
            sandboxTimeout: 10,
            sdkAuthToken: 'new',
            superfaceApiUrl: 'https://superface.ai/new',
            superfaceCacheTimeout: 3600,
            superfacePath: '/Users/someone/new/super.json',
          }),
          NodeFileSystem
        )
      ).toEqual(
        new Config(NodeFileSystem, {
          disableReporting: false,
          metricDebounceTimeMax: 1000,
          metricDebounceTimeMin: 100,
          sandboxTimeout: 10,
          sdkAuthToken: 'new',
          superfaceApiUrl: 'https://superface.ai/new',
          superfaceCacheTimeout: 3600,
          superfacePath: '/Users/someone/new/super.json',
        })
      );
    });

    it('returns config with values from old config', async () => {
      expect(
        mergeConfigs(
          {
            disableReporting: true,
            metricDebounceTimeMax: 100,
            metricDebounceTimeMin: 10,
            sandboxTimeout: 1,
            sdkAuthToken: 'old',
            superfaceApiUrl: 'https://superface.ai/old',
            superfaceCacheTimeout: 3,
            superfacePath: '/Users/someone/old/super.json',
            cachePath: '.cache',
          },
          {
            superfacePath: '/Users/someone/new/super.json',
          },
          NodeFileSystem
        )
      ).toEqual(
        new Config(NodeFileSystem, {
          disableReporting: true,
          metricDebounceTimeMax: 100,
          metricDebounceTimeMin: 10,
          sandboxTimeout: 1,
          sdkAuthToken: 'old',
          superfaceApiUrl: 'https://superface.ai/old',
          superfaceCacheTimeout: 3,
          superfacePath: '/Users/someone/new/super.json',
          cachePath: '.cache',
        })
      );
    });

    it('returns config with default values', async () => {
      expect(mergeConfigs({}, {}, NodeFileSystem)).toEqual(
        new Config(NodeFileSystem)
      );
    });
  });

  describe('when loading from code', () => {
    it('returns config with correct values', async () => {
      const customEnv = {
        disableReporting: true,
        metricDebounceTimeMax: 120000,
        metricDebounceTimeMin: 10000,
        sandboxTimeout: 1,
        sdkAuthToken:
          'sfs_f42eb7s8f8f0399fdd69854b716ab2c176a87d1b3a8bdbb65b4155550c17518982783a98bd0e7225eb22065ebb30ae09d13c0c4e22b6368087681d6e588eea41_d1011fdc',
        superfaceApiUrl: 'https://superface.ai/custom/url',
        superfaceCacheTimeout: 36000,
        superfacePath: '/Users/someone/superface/super.json',
      };
      const customConfig = loadConfigFromCode(customEnv, NodeFileSystem);
      expect(customConfig.disableReporting).toEqual(customEnv.disableReporting);
      expect(customConfig.metricDebounceTimeMax).toEqual(
        customEnv.metricDebounceTimeMax
      );
      expect(customConfig.metricDebounceTimeMin).toEqual(
        customEnv.metricDebounceTimeMin
      );
      expect(customConfig.sandboxTimeout).toEqual(customEnv.sandboxTimeout);
      expect(customConfig.sdkAuthToken).toEqual(customEnv.sdkAuthToken);
      expect(customConfig.superfaceApiUrl).toEqual(customEnv.superfaceApiUrl);
      expect(customConfig.superfaceCacheTimeout).toEqual(
        customEnv.superfaceCacheTimeout
      );
      expect(customConfig.superfacePath).toEqual(customEnv.superfacePath);
    });

    it('throws on invalid url', async () => {
      expect(() =>
        loadConfigFromCode(
          {
            superfaceApiUrl: 'superface.ai',
          },
          NodeFileSystem
        )
      ).toThrowError(new TypeError('Invalid URL'));
    });

    it('replaces invalid values with defaults', async () => {
      const customConfig = loadConfigFromCode(
        {
          disableReporting: false,
          metricDebounceTimeMax: -1,
          metricDebounceTimeMin: -10,
          sandboxTimeout: 0,
          sdkAuthToken: 'foo',
          superfaceCacheTimeout: -3,
        },
        NodeFileSystem
      );

      const configWithDefaults = new Config(NodeFileSystem);

      expect(customConfig.disableReporting).toEqual(
        configWithDefaults.disableReporting
      );
      expect(customConfig.metricDebounceTimeMax).toEqual(
        configWithDefaults.metricDebounceTimeMax
      );
      expect(customConfig.metricDebounceTimeMin).toEqual(
        configWithDefaults.metricDebounceTimeMin
      );
      expect(customConfig.sandboxTimeout).toEqual(
        configWithDefaults.sandboxTimeout
      );
      expect(customConfig.sdkAuthToken).toEqual(
        configWithDefaults.sdkAuthToken
      );
      expect(customConfig.superfaceApiUrl).toEqual(
        configWithDefaults.superfaceApiUrl
      );
      expect(customConfig.superfaceCacheTimeout).toEqual(
        configWithDefaults.superfaceCacheTimeout
      );
      expect(customConfig.superfacePath).toEqual(
        configWithDefaults.superfacePath
      );
    });
  });
});
