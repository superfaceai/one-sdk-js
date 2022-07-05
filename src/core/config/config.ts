import {
  IConfig,
  IEnvironment,
  IFileSystem,
  ILogger,
  LogFunction,
} from '../interfaces';

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
  return ensureValidUrl(environment.getString(API_URL_ENV_NAME));
}

function getSdkAuthToken(
  environment: IEnvironment,
  log?: LogFunction
): string | undefined {
  return ensureValidSdkToken(
    environment.getString(TOKEN_ENV_NAME),
    TOKEN_ENV_NAME,
    log
  );
}

function ensureValidSdkToken(
  value: string | undefined,
  variableName: string,
  log?: LogFunction
): string | undefined {
  if (value === undefined) {
    log?.(`Variable ${variableName} not found`);

    return;
  }

  const tokenRegexp = /^(sfs)_([^_]+)_([0-9A-F]{8})$/i;
  if (!tokenRegexp.test(value)) {
    log?.(
      `Value in environment variable ${variableName} is not valid SDK authentization token`
    );

    return;
  }

  return value;
}

function ensureValidUrl(value: string | undefined): string | undefined {
  return value !== undefined ? new URL(value).href : undefined;
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

  constructor(fileSystem: FSPath, config?: Partial<IConfig>) {
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

export function mergeConfigs(
  originalConfig: Config,
  newConfig: Config,
  fileSystem: FSPath,
  logger?: ILogger
): Config {
  const env = {
    superfaceApiUrl:
      newConfig.superfaceApiUrl ?? originalConfig.superfaceApiUrl,
    sdkAuthToken: newConfig.sdkAuthToken ?? originalConfig.sdkAuthToken,
    superfacePath: newConfig.superfacePath ?? originalConfig.superfacePath,
    superfaceCacheTimeout:
      newConfig.superfaceCacheTimeout ?? originalConfig.superfaceCacheTimeout,
    metricDebounceTimeMin:
      newConfig.metricDebounceTimeMin ?? originalConfig.metricDebounceTimeMin,
    metricDebounceTimeMax:
      newConfig.metricDebounceTimeMax ?? originalConfig.metricDebounceTimeMax,
    disableReporting:
      newConfig.disableReporting ?? originalConfig.disableReporting,
    cachePath: newConfig.cachePath ?? originalConfig.cachePath,
    sandboxTimeout: newConfig.sandboxTimeout ?? originalConfig.sandboxTimeout,
  };

  logger?.log(
    DEBUG_NAMESPACE,
    'Merged config A: %O with B: %O to: %O',
    originalConfig,
    newConfig,
    env
  );

  return new Config(fileSystem, env);
}

export function loadConfigFromCode(
  config: Partial<IConfig>,
  fileSystem: FSPath,
  logger?: ILogger
): Config {
  const env = {
    superfaceApiUrl: ensureValidUrl(config.superfaceApiUrl),
    sdkAuthToken: ensureValidSdkToken(
      config.sdkAuthToken,
      'sdkAuthToken',
      logger?.log(DEBUG_NAMESPACE)
    ),
    // TODO: Check if it is path?
    superfacePath: config.superfacePath,
    superfaceCacheTimeout: ensurePositiveInteger(
      config.superfaceCacheTimeout,
      'superfaceCacheTimeout',
      logger?.log(DEBUG_NAMESPACE)
    ),
    // TODO: check if min is less than max?
    metricDebounceTimeMin: ensurePositiveInteger(
      config.metricDebounceTimeMin,
      'metricDebounceTimeMin',
      logger?.log(DEBUG_NAMESPACE)
    ),
    metricDebounceTimeMax: ensurePositiveInteger(
      config.metricDebounceTimeMax,
      'metricDebounceTimeMax',
      logger?.log(DEBUG_NAMESPACE)
    ),
    disableReporting: config.disableReporting,
    // TODO: Check if it is path?
    cachePath: config.cachePath,
    sandboxTimeout: ensurePositiveInteger(
      config.sandboxTimeout,
      'sandboxTimeout',
      logger?.log(DEBUG_NAMESPACE)
    ),
  };

  logger?.log(DEBUG_NAMESPACE, 'Loaded config from code: %O', env);

  return new Config(fileSystem, env);
}

export function loadConfigFromEnv(
  environment: IEnvironment,
  fileSystem: FSPath,
  logger?: ILogger
): Config {
  const env = {
    superfaceApiUrl: getSuperfaceApiUrl(environment),
    sdkAuthToken: getSdkAuthToken(environment, logger?.log(DEBUG_NAMESPACE)),
    superfacePath:
      environment.getString(SUPERFACE_PATH_NAME) ??
      DEFAULT_SUPERFACE_PATH(fileSystem),
    superfaceCacheTimeout: getBoundCacheTimeout(
      environment,
      logger?.log(DEBUG_NAMESPACE)
    ),
    metricDebounceTimeMin: getMetricDebounceTime(
      'min',
      environment,
      logger?.log(DEBUG_NAMESPACE)
    ),
    metricDebounceTimeMax: getMetricDebounceTime(
      'max',
      environment,
      logger?.log(DEBUG_NAMESPACE)
    ),
    disableReporting:
      environment.getString('NODE_ENV') === 'test' ||
      environment.getBoolean(DISABLE_REPORTING) === true
        ? true
        : undefined,
    // TODO: add env variable and resolve it?
    cachePath: undefined,
    sandboxTimeout: getSandboxTimeout(
      environment,
      logger?.log(DEBUG_NAMESPACE)
    ),
  };

  logger?.log(
    DEBUG_NAMESPACE,
    'Loaded config from environment variables: %O',
    env
  );

  return new Config(fileSystem, env);
}
