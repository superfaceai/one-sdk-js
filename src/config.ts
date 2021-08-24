import createDebug from 'debug';
import { join as joinPath } from 'path';

const configDebug = createDebug('superface:config');

// Environment variable names
const TOKEN_ENV_NAME = 'SUPERFACE_SDK_TOKEN';
const API_URL_ENV_NAME = 'SUPERFACE_API_URL';
const SUPERFACE_PATH_NAME = 'SUPERFACE_PATH';
const METRIC_DEBOUNCE_TIME = {
  min: 'SUPERFACE_METRIC_DEBOUNCE_TIME_MIN',
  max: 'SUPERFACE_METRIC_DEBOUNCE_TIME_MAX',
};
const DISABLE_REPORTING = 'SUPERFACE_DISABLE_METRIC_REPORTING';

// Defaults
export const DEFAULT_API_URL = 'https://superface.ai';
export const DEFAULT_SUPERFACE_PATH = joinPath(
  process.cwd(),
  'superface',
  'super.json'
);
export const DEFAULT_METRIC_DEBOUNCE_TIME = {
  min: 1000,
  max: 60000,
};
export const DEFAULT_CACHE_PATH = joinPath(
  process.cwd(),
  '.cache',
  'superface'
);

// Extraction functions
function getSuperfaceApiUrl(): string {
  const envUrl = process.env[API_URL_ENV_NAME];

  return envUrl ? new URL(envUrl).href : new URL(DEFAULT_API_URL).href;
}

function getSdkAuthToken(): string | undefined {
  const loadedToken = process.env[TOKEN_ENV_NAME];
  if (!loadedToken) {
    configDebug(`Environment variable ${TOKEN_ENV_NAME} not found`);

    return;
  }
  const token = loadedToken.trim();
  const tokenRegexp = /^(sfs)_([^_]+)_([0-9A-F]{8})$/i;
  if (!tokenRegexp.test(token)) {
    configDebug(
      `Value in environment variable ${TOKEN_ENV_NAME} is not valid SDK authentization token`
    );

    return;
  }

  return token;
}

function getMetricDebounceTime(which: 'min' | 'max'): number {
  const envValue = process.env[METRIC_DEBOUNCE_TIME[which]];
  if (envValue === undefined) {
    return DEFAULT_METRIC_DEBOUNCE_TIME[which];
  }

  try {
    const result = parseInt(envValue);
    if (result <= 0) {
      throw undefined;
    }

    return result;
  } catch (e) {
    configDebug(
      `Invalid value: ${envValue} for ${METRIC_DEBOUNCE_TIME[which]}, expected positive number`
    );

    return DEFAULT_METRIC_DEBOUNCE_TIME[which];
  }
}

export class Config {
  private static _instance?: Config;

  static instance(): Config {
    if (Config._instance === undefined) {
      Config._instance = new Config();
    }

    return Config._instance;
  }

  static reloadFromEnv(): Config {
    Config._instance = undefined;

    return Config.instance();
  }

  public superfaceApiUrl: string;
  public sdkAuthToken?: string;
  public superfacePath: string;
  public metricDebounceTimeMin: number;
  public metricDebounceTimeMax: number;
  public disableReporting: boolean;
  public cachePath: string;

  private static loadEnv() {
    return {
      superfaceApiUrl: getSuperfaceApiUrl(),
      sdkAuthToken: getSdkAuthToken(),
      superfacePath: process.env[SUPERFACE_PATH_NAME] ?? DEFAULT_SUPERFACE_PATH,
      metricDebounceTimeMin: getMetricDebounceTime('min'),
      metricDebounceTimeMax: getMetricDebounceTime('max'),
      disableReporting:
        process.env.NODE_ENV === 'test'
          ? true
          : !!process.env[DISABLE_REPORTING],
      cachePath: DEFAULT_CACHE_PATH,
    };
  }

  private constructor() {
    const env = Config.loadEnv();
    this.superfaceApiUrl = env.superfaceApiUrl;
    this.sdkAuthToken = env.sdkAuthToken;
    this.superfacePath = env.superfacePath;
    this.metricDebounceTimeMin = env.metricDebounceTimeMin;
    this.metricDebounceTimeMax = env.metricDebounceTimeMax;
    this.disableReporting = env.disableReporting;
    this.cachePath = env.cachePath;
  }
}
