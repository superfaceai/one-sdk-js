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
  debug: boolean;
}
