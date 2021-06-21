import { Config } from '../config';
import {
  FetchInstance,
  JSON_CONTENT,
  stringBody,
} from '../internal/interpreter/http/interfaces';
import { AnonymizedSuperJsonDocument, SuperJson } from '../internal/superjson';
import { CrossFetch } from './fetch';

type EventBase = {
  event_type: 'SDKInit' | 'Metrics' | 'ProviderChange';
  configuration_hash: string;
  occured_at: string;
};

type SDKInitEvent = EventBase & {
  event_type: 'SDKInit';
  data: {
    configuration: AnonymizedSuperJsonDocument;
  };
};

type PerformMetricsEvent = EventBase & {
  event_type: 'Metrics';
  data: {
    from: string;
    to: string;
    metrics: {
      profile: string;
      provider: string;
      successful_performs: number;
      failed_performs: number;
    }[];
  };
};

export const enum FailoverReason {
  NETWORK_ERROR_DNS = 'NETWORK_ERROR_DNS',
  NETWORK_ERROR_SSL = 'NETWORK_ERROR_SSL',
  NETWORK_ERROR_CONNECTION = 'NETWORK_ERROR_CONNECTION',
  NETWORK_ERROR_TIMEOUT = 'NETWORK_ERROR_TIMEOUT',
  HTTP_ERROR_500 = 'HTTP_ERROR_500',
}

type ProviderChangeEvent = EventBase & {
  event_type: 'ProviderChange';
  data: {
    profile: string;
    from_provider: string;
    to_provider: string;
    failover_reasons?: {
      reason: FailoverReason;
      occured_at: string;
    }[];
  };
};

type SDKEvent = SDKInitEvent | PerformMetricsEvent | ProviderChangeEvent;

type EventInputBase = {
  eventType: 'SDKInit' | 'PerformMetrics' | 'ProviderChange';
  occuredAt: Date;
};

export type SDKInitInput = EventInputBase & {
  eventType: 'SDKInit';
};

export type PerformMetricsInput = EventInputBase & {
  eventType: 'PerformMetrics';
  profile: string;
  provider: string;
  success: boolean;
};

export type ProviderChangeInput = EventInputBase & {
  eventType: 'ProviderChange';
  from: string;
  to: string;
  profile: string;
  reasons?: {
    reason: FailoverReason;
    occuredAt: Date;
  }[];
};

export type EventInput =
  | SDKInitInput
  | PerformMetricsInput
  | ProviderChangeInput;

export class MetricReporter {
  private timer: NodeJS.Timeout | undefined;
  private fetchInstance: FetchInstance;
  private readonly sdkToken: string | undefined;
  private performMetrics: Omit<PerformMetricsInput, 'eventType'>[] = [];

  constructor(private readonly superJson: SuperJson) {
    this.fetchInstance = new CrossFetch();
    this.sdkToken = Config.sdkAuthToken;
  }

  public reportEvent(event: EventInput): void {
    // console.log(event);
    switch (event.eventType) {
      case 'SDKInit':
        this.reportSdkInitEvent(event);
        break;

      case 'PerformMetrics':
        this.reportPerformMetricsEvent(event);
        break;

      case 'ProviderChange':
        this.reportProviderChangeEvent(event);
        break;
    }
  }

  public flush(): void {
    if (this.timer !== undefined) {
      this.sendEvent(this.aggregateMetrics());
      this.performMetrics = [];
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private reportSdkInitEvent(event: SDKInitInput): void {
    this.sendEvent(this.createSDKInitEventPayload(event));
  }

  private reportPerformMetricsEvent({
    eventType: _,
    ...metrics
  }: PerformMetricsInput): void {
    this.performMetrics.push(metrics);
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
    }
    // console.log('here');
    this.timer = setTimeout(() => {
      this.sendEvent(this.aggregateMetrics());
      this.performMetrics = [];
      if (this.timer !== undefined) {
        clearTimeout(this.timer);
        this.timer = undefined;
      }
    }, 10000);
  }

  private reportProviderChangeEvent(event: ProviderChangeInput): void {
    this.sendEvent(this.createProviderChangeEventPayload(event));
  }

  private createSDKInitEventPayload(input: SDKInitInput): SDKInitEvent {
    return {
      event_type: 'SDKInit',
      occured_at: input.occuredAt.toISOString(),
      configuration_hash: this.superJson.configHash(),
      data: {
        configuration: this.superJson.anonymized,
      },
    };
  }

  private createProviderChangeEventPayload(
    input: ProviderChangeInput
  ): ProviderChangeEvent {
    return {
      event_type: 'ProviderChange',
      occured_at: input.occuredAt.toISOString(),
      configuration_hash: this.superJson.configHash(),
      data: {
        profile: input.profile,
        from_provider: input.from,
        to_provider: input.to,
        failover_reasons: input.reasons?.map(reason => ({
          reason: reason.reason,
          occured_at: reason.occuredAt.toISOString(),
        })),
      },
    };
  }

  private aggregateMetrics(): PerformMetricsEvent {
    const metrics: PerformMetricsEvent['data']['metrics'] = [];
    const dates = this.performMetrics.map(metric => metric.occuredAt).sort();
    const from = dates[0].toISOString();
    const to = dates[dates.length - 1].toISOString();
    const profileProviders = this.performMetrics
      .map(metric => [metric.profile, metric.provider])
      .filter(
        ([profile, provider], index, array) =>
          array.findIndex(
            ([prof, prov]) => prof === profile && prov === provider
          ) === index
      );

    for (const [profile, provider] of profileProviders) {
      const profileProviderMetrics = this.performMetrics.filter(
        metric => metric.profile === profile && metric.provider === provider
      );
      const successes = profileProviderMetrics.filter(
        metric => metric.success
      ).length;
      const failures = profileProviderMetrics.length - successes;

      metrics.push({
        profile,
        provider,
        successful_performs: successes,
        failed_performs: failures,
      });
    }

    // console.log(metrics);

    return {
      event_type: 'Metrics',
      occured_at: new Date().toISOString(),
      configuration_hash: this.superJson.configHash(),
      data: {
        from,
        to,
        metrics,
      },
    };
  }

  // TODO: move this to other http calls
  private sendEvent(payload: SDKEvent) {
    const url = new URL('/sdk-events', Config.superfaceApiUrl).href;
    void this.fetchInstance.fetch(url, {
      method: 'POST',
      body: stringBody(JSON.stringify(payload)),
      headers: {
        'content-type': JSON_CONTENT,
        ...(this.sdkToken !== undefined
          ? { authorization: `SUPERFACE-SDK-TOKEN ${this.sdkToken}` }
          : {}),
      },
    });
  }
}
