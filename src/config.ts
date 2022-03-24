import createDebug from 'debug';
import { join as joinPath } from 'path';

const configDebug = createDebug('superface:config');

export interface IConfig {
  cachePath: string;
  disableReporting: boolean;
  metricDebounceTimeMax: number;
  metricDebounceTimeMin: number;
  sandboxTimeout: number;
  sdkAuthToken?: string;
  superfaceApiUrl: string;
  superfacePath: string;
}

// Environment variable names
const TOKEN_ENV_NAME = 'SUPERFACE_SDK_TOKEN';
const API_URL_ENV_NAME = 'SUPERFACE_API_URL';
const SUPERFACE_PATH_NAME = 'SUPERFACE_PATH';
const METRIC_DEBOUNCE_TIME = {
  min: 'SUPERFACE_METRIC_DEBOUNCE_TIME_MIN',
  max: 'SUPERFACE_METRIC_DEBOUNCE_TIME_MAX',
};
const DISABLE_REPORTING = 'SUPERFACE_DISABLE_METRIC_REPORTING';
const SANDBOX_TIMEOUT_ENV_NAME = 'SUPERFACE_SANDBOX_TIMEOUT';

// Defaults
export const DEFAULT_API_URL = new URL('https://superface.ai').href;
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
  'superface',
  '.cache'
);
export const DEFAULT_SANDBOX_TIMEOUT = 100;
export const DEFAULT_DISABLE_REPORTING = false;

const defaults: IConfig = {
  cachePath: DEFAULT_CACHE_PATH,
  disableReporting: DEFAULT_DISABLE_REPORTING,
  metricDebounceTimeMax: DEFAULT_METRIC_DEBOUNCE_TIME.max,
  metricDebounceTimeMin: DEFAULT_METRIC_DEBOUNCE_TIME.min,
  sandboxTimeout: DEFAULT_SANDBOX_TIMEOUT,
  sdkAuthToken: undefined,
  superfaceApiUrl: DEFAULT_API_URL,
  superfacePath: DEFAULT_SUPERFACE_PATH,
};

// Extraction functions
function getSuperfaceApiUrl(): string | undefined {
  const envUrl = process.env[API_URL_ENV_NAME];

  return envUrl ? new URL(envUrl).href : undefined;
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

function getMetricDebounceTime(which: 'min' | 'max'): number | undefined {
  const envValue = process.env[METRIC_DEBOUNCE_TIME[which]];
  if (envValue === undefined) {
    return undefined;
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

    return undefined;
  }
}

function getSandboxTimeout(): number {
  const envValue = process.env[SANDBOX_TIMEOUT_ENV_NAME];
  if (envValue === undefined) {
    return DEFAULT_SANDBOX_TIMEOUT;
  }

  try {
    const result = parseInt(envValue);
    if (result <= 0) {
      throw undefined;
    }

    return result;
  } catch (e) {
    configDebug(
      `Invalid value: ${envValue} for ${SANDBOX_TIMEOUT_ENV_NAME}, expected positive number`
    );

    return DEFAULT_SANDBOX_TIMEOUT;
  }
}

export class Config implements IConfig {
  public cachePath: string;
  public disableReporting: boolean;
  public metricDebounceTimeMax: number;
  public metricDebounceTimeMin: number;
  public sandboxTimeout: number;
  public sdkAuthToken?: string;
  public superfaceApiUrl: string;
  public superfacePath: string;

  public constructor(config?: Partial<IConfig>) {
    this.cachePath = config?.cachePath ?? defaults.cachePath;
    this.disableReporting =
      config?.disableReporting ?? defaults.disableReporting;
    this.metricDebounceTimeMax =
      config?.metricDebounceTimeMax ?? defaults.metricDebounceTimeMax;
    this.metricDebounceTimeMin =
      config?.metricDebounceTimeMin ?? defaults.metricDebounceTimeMin;
    this.sandboxTimeout = config?.sandboxTimeout ?? defaults.sandboxTimeout;
    this.sdkAuthToken = config?.sdkAuthToken ?? defaults.sdkAuthToken;
    this.superfaceApiUrl = config?.superfaceApiUrl ?? defaults.superfaceApiUrl;
    this.superfacePath = config?.superfacePath ?? defaults.superfacePath;
  }

  static loadFromEnv(): Config {
    const env = new Config().loadEnv();

    configDebug(
      `Loaded config from environment variables: ${JSON.stringify(env)}`
    );

    return new Config(env);
  }

  private loadEnv() {
    return {
      superfaceApiUrl: getSuperfaceApiUrl(),
      sdkAuthToken: getSdkAuthToken(),
      superfacePath: process.env[SUPERFACE_PATH_NAME],
      metricDebounceTimeMin: getMetricDebounceTime('min'),
      metricDebounceTimeMax: getMetricDebounceTime('max'),
      disableReporting:
        process.env.NODE_ENV === 'test' ||
        process.env[DISABLE_REPORTING] === 'true'
          ? true
          : undefined,
      cachePath: undefined,
      sandboxTimeout: getSandboxTimeout(),
    };
  }
}
