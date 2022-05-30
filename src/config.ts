import { IFileSystem } from './lib/io';
import { NodeFileSystem } from './lib/io/filesystem.node';
import { ILogger, LogFunction } from './lib/logger/logger';

const DEBUG_NAMESPACE = 'config';

type JoinPath = { path: { join: IFileSystem['path']['join'] } };

export interface IConfig {
  cachePath: string;
  disableReporting: boolean;
  metricDebounceTimeMax: number;
  metricDebounceTimeMin: number;
  sandboxTimeout: number;
  sdkAuthToken?: string;
  superfaceApiUrl: string;
  superfaceCacheTimeout: number;
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
const BOUND_PROVIDER_CACHE_TIMEOUT = 'SUPERFACE_CACHE_TIMEOUT';

// Defaults
export const DEFAULT_API_URL = new URL('https://superface.ai').href;
export const DEFAULT_SUPERFACE_PATH = (fileSystem: JoinPath): string =>
  fileSystem.path.join(process.cwd(), 'superface', 'super.json');
export const DEFAULT_METRIC_DEBOUNCE_TIME = {
  min: 1000,
  max: 60000,
};
export const DEFAULT_CACHE_PATH = (fileSystem: JoinPath): string =>
  fileSystem.path.join(process.cwd(), 'superface', '.cache');
export const DEFAULT_SANDBOX_TIMEOUT = 100;
export const DEFAULT_DISABLE_REPORTING = false;
// 1 hour
export const DEFAULT_BOUND_PROVIDER_TIMEOUT = 60 * 60;

const DEFAULTS = (fileSystem: JoinPath): IConfig => ({
  cachePath: DEFAULT_CACHE_PATH(fileSystem),
  disableReporting: DEFAULT_DISABLE_REPORTING,
  metricDebounceTimeMax: DEFAULT_METRIC_DEBOUNCE_TIME.max,
  metricDebounceTimeMin: DEFAULT_METRIC_DEBOUNCE_TIME.min,
  sandboxTimeout: DEFAULT_SANDBOX_TIMEOUT,
  sdkAuthToken: undefined,
  superfaceApiUrl: DEFAULT_API_URL,
  superfaceCacheTimeout: DEFAULT_BOUND_PROVIDER_TIMEOUT,
  superfacePath: DEFAULT_SUPERFACE_PATH(fileSystem),
});

// Extraction functions
function getSuperfaceApiUrl(): string | undefined {
  const envUrl = process.env[API_URL_ENV_NAME];

  return envUrl !== undefined ? new URL(envUrl).href : undefined;
}

function getSdkAuthToken(log?: LogFunction): string | undefined {
  const loadedToken = process.env[TOKEN_ENV_NAME];
  if (loadedToken === undefined) {
    log?.(`Environment variable ${TOKEN_ENV_NAME} not found`);

    return;
  }
  const token = loadedToken.trim();
  const tokenRegexp = /^(sfs)_([^_]+)_([0-9A-F]{8})$/i;
  if (!tokenRegexp.test(token)) {
    log?.(
      `Value in environment variable ${TOKEN_ENV_NAME} is not valid SDK authentization token`
    );

    return;
  }

  return token;
}

function getBoundCacheTimeout(logger?: LogFunction): number {
  const envValue = process.env[BOUND_PROVIDER_CACHE_TIMEOUT];
  if (envValue === undefined) {
    return DEFAULT_BOUND_PROVIDER_TIMEOUT;
  }

  try {
    const result = parseInt(envValue);
    if (result <= 0) {
      throw undefined;
    }

    return result;
  } catch (e) {
    logger?.(
      `Invalid value: ${envValue} for ${BOUND_PROVIDER_CACHE_TIMEOUT}, expected positive number`
    );

    return DEFAULT_BOUND_PROVIDER_TIMEOUT;
  }
}

function getMetricDebounceTime(
  which: 'min' | 'max',
  log?: LogFunction
): number | undefined {
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
    log?.(
      `Invalid value: ${envValue} for ${METRIC_DEBOUNCE_TIME[which]}, expected positive number`
    );

    return undefined;
  }
}

function getSandboxTimeout(logger?: LogFunction): number {
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
    logger?.(
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
  public superfaceCacheTimeout: number;
  public superfacePath: string;

  private readonly log: LogFunction | undefined;

  public constructor(
    logger?: ILogger,
    config?: Partial<IConfig>,
    private fileSystem: JoinPath = NodeFileSystem
  ) {
    const defaults = DEFAULTS(fileSystem);
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
    this.superfaceCacheTimeout =
      config?.superfaceCacheTimeout ?? defaults.superfaceCacheTimeout;
    this.superfacePath = config?.superfacePath ?? defaults.superfacePath;

    this.log = logger?.log(DEBUG_NAMESPACE);
  }

  static loadFromEnv(logger?: ILogger): Config {
    const env = new Config(logger).loadEnv();

    return new Config(logger, env);
  }

  private loadEnv() {
    const env = {
      superfaceApiUrl: getSuperfaceApiUrl(),
      sdkAuthToken: getSdkAuthToken(),
      superfacePath:
        process.env[SUPERFACE_PATH_NAME] ??
        DEFAULT_SUPERFACE_PATH(this.fileSystem),
      superfaceCacheTimeout: getBoundCacheTimeout(),
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

    this.log?.('Loaded config from environment variables: %O', env);

    return env;
  }
}
