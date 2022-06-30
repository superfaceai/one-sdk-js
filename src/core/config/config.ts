import {
  IConfig,
  IEnvironment,
  IFileSystem,
  ILogger,
  LogFunction,
} from '~core';
import { NodeFileSystem } from '~node';

const DEBUG_NAMESPACE = 'config';

type FSPath = {
  path: Pick<IFileSystem['path'], 'join' | 'cwd'>;
};

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
export const DEFAULT_SUPERFACE_PATH = (fileSystem: FSPath): string =>
  fileSystem.path.join(fileSystem.path.cwd(), 'superface', 'super.json');
export const DEFAULT_METRIC_DEBOUNCE_TIME = {
  min: 1000,
  max: 60000,
};
export const DEFAULT_CACHE_PATH = (fileSystem: FSPath): string =>
  fileSystem.path.join(fileSystem.path.cwd(), 'superface', '.cache');
export const DEFAULT_SANDBOX_TIMEOUT = 100;
export const DEFAULT_DISABLE_REPORTING = false;
// 1 hour
export const DEFAULT_BOUND_PROVIDER_TIMEOUT = 60 * 60;

const DEFAULTS = (fileSystem: FSPath): IConfig => ({
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
function getSuperfaceApiUrl(environment: IEnvironment): string | undefined {
  const envUrl = environment.getString(API_URL_ENV_NAME);

  return envUrl !== undefined ? new URL(envUrl).href : undefined;
}

function getSdkAuthToken(
  environment: IEnvironment,
  log?: LogFunction
): string | undefined {
  const token = environment.getString(TOKEN_ENV_NAME);

  if (token === undefined) {
    log?.(`Environment variable ${TOKEN_ENV_NAME} not found`);

    return;
  }

  const tokenRegexp = /^(sfs)_([^_]+)_([0-9A-F]{8})$/i;
  if (!tokenRegexp.test(token)) {
    log?.(
      `Value in environment variable ${TOKEN_ENV_NAME} is not valid SDK authentization token`
    );

    return;
  }

  return token;
}

function ensurePositiveInteger(
  value: number | undefined,
  variableName: string,
  log?: LogFunction
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (isNaN(value) || value <= 0) {
    log?.(
      `Invalid value: ${value} for ${variableName}, expected positive number`
    );

    return undefined;
  }

  return value;
}

function getBoundCacheTimeout(
  environment: IEnvironment,
  log?: LogFunction
): number | undefined {
  const value = ensurePositiveInteger(
    environment.getNumber(BOUND_PROVIDER_CACHE_TIMEOUT),
    BOUND_PROVIDER_CACHE_TIMEOUT,
    log
  );

  return value;
}

function getMetricDebounceTime(
  which: 'min' | 'max',
  environment: IEnvironment,
  log?: LogFunction
): number | undefined {
  const value = ensurePositiveInteger(
    environment.getNumber(METRIC_DEBOUNCE_TIME[which]),
    METRIC_DEBOUNCE_TIME[which],
    log
  );

  return value;
}

function getSandboxTimeout(
  environment: IEnvironment,
  log?: LogFunction
): number | undefined {
  const value = ensurePositiveInteger(
    environment.getNumber(SANDBOX_TIMEOUT_ENV_NAME),
    SANDBOX_TIMEOUT_ENV_NAME,
    log
  );

  return value;
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

  constructor(config?: Partial<IConfig>, fileSystem: FSPath = NodeFileSystem) {
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
  }
}

export function loadConfigFromEnv(
  environment: IEnvironment,
  logger?: ILogger,
  fileSystem: FSPath = NodeFileSystem
): Config {
  const env = {
    superfaceApiUrl: getSuperfaceApiUrl(environment),
    sdkAuthToken: getSdkAuthToken(environment),
    superfacePath:
      environment.getString(SUPERFACE_PATH_NAME) ??
      DEFAULT_SUPERFACE_PATH(fileSystem),
    superfaceCacheTimeout: getBoundCacheTimeout(environment),
    metricDebounceTimeMin: getMetricDebounceTime('min', environment),
    metricDebounceTimeMax: getMetricDebounceTime('max', environment),
    disableReporting:
      environment.getString('NODE_ENV') === 'test' ||
      environment.getBoolean(DISABLE_REPORTING) === true
        ? true
        : undefined,
    cachePath: undefined,
    sandboxTimeout: getSandboxTimeout(environment),
  };

  logger?.log(
    DEBUG_NAMESPACE,
    'Loaded config from environment variables: %O',
    env
  );

  return new Config(env, fileSystem);
}
