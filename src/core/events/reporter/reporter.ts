import type {
  AnonymizedSuperJsonDocument,
  NormalizedSuperJsonDocument,
} from '@superfaceai/ast';

import type {
  IConfig,
  ICrypto,
  ILogger,
  ITimeout,
  ITimers,
  LogFunction,
} from '../../../interfaces';
import { UnexpectedError } from '../../../lib';
import type { IFetch } from '../../interpreter';
import { JSON_CONTENT, stringBody } from '../../interpreter';
import type { Events, FailureContext, SuccessContext } from '../events';
import type { FailurePolicyReason } from '../failure';
import { anonymizeSuperJson, hashSuperJson } from './utils';

const DEBUG_NAMESPACE = 'metric-reporter';

type EventBase = {
  event_type: 'SDKInit' | 'Metrics' | 'ProviderChange';
  configuration_hash: string | undefined;
  occurred_at: string;
};

type SDKInitEvent = EventBase & {
  event_type: 'SDKInit';
  data: {
    configuration: AnonymizedSuperJsonDocument | undefined;
  };
};

type PerformMetricsEvent = EventBase & {
  event_type: 'Metrics';
  data: {
    from: string;
    to: string;
    metrics: {
      type: 'PerformMetrics';
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
  REQUEST_ERROR_TIMEOUT = 'REQUEST_ERROR_TIMEOUT',
  REQUEST_ERROR_ABORT = 'REQUEST_ERROR_ABORT',
  HTTP_ERROR_500 = 'HTTP_ERROR_500',
  UNEXPECTED_ERROR = 'UNEXPECTED_ERROR',
}

// TODO: Make this better
function failurePolicyReasonToFailoverReason(
  reason: FailurePolicyReason
): FailoverReason {
  if (reason.data.kind === 'failure') {
    if (reason.data.failure.kind === 'network') {
      switch (reason.data.failure.issue) {
        case 'dns':
          return FailoverReason.NETWORK_ERROR_DNS;
        case 'timeout':
          return FailoverReason.NETWORK_ERROR_TIMEOUT;
        case 'unsigned-ssl':
          return FailoverReason.NETWORK_ERROR_SSL;
        case 'reject':
          return FailoverReason.NETWORK_ERROR_CONNECTION;
      }
    } else if (reason.data.failure.kind === 'request') {
      switch (reason.data.failure.issue) {
        case 'timeout':
          return FailoverReason.REQUEST_ERROR_TIMEOUT;
        case 'abort':
          return FailoverReason.REQUEST_ERROR_ABORT;
      }
    } else {
      if (reason.data.failure.kind === 'http') {
        if (reason.data.failure.response.statusCode === 500) {
          return FailoverReason.HTTP_ERROR_500;
        }
      }
    }
  }

  return FailoverReason.UNEXPECTED_ERROR;
}

type ProviderChangeEvent = EventBase & {
  event_type: 'ProviderChange';
  data: {
    profile: string;
    from_provider: string;
    to_provider?: string;
    failover_reasons?: {
      reason: FailoverReason;
      occurred_at: string;
    }[];
  };
};

type SDKEvent = SDKInitEvent | PerformMetricsEvent | ProviderChangeEvent;

type EventInputBase = {
  eventType: 'SDKInit' | 'PerformMetrics' | 'ProviderChange';
  occurredAt: Date;
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
  to?: string;
  profile: string;
  reasons?: {
    reason: FailurePolicyReason;
    occurredAt: Date;
  }[];
};

export type EventInput =
  | SDKInitInput
  | PerformMetricsInput
  | ProviderChangeInput;

export function hookMetrics(
  events: Events,
  metricReporter: MetricReporter
): void {
  events.on('success', { priority: 0 }, (context: SuccessContext) => {
    metricReporter.reportEvent({
      eventType: 'PerformMetrics',
      profile: context.profile,
      success: true,
      provider: context.provider,
      occurredAt: context.time,
    });

    return { kind: 'continue' };
  });
  events.on('failure', { priority: 0 }, (context: FailureContext) => {
    metricReporter.reportEvent({
      eventType: 'PerformMetrics',
      profile: context.profile,
      success: false,
      provider: context.provider,
      occurredAt: context.time,
    });

    return { kind: 'continue' };
  });
  events.on('provider-switch', { priority: 1000 }, context => {
    metricReporter.reportEvent({
      eventType: 'ProviderChange',
      profile: context.profile,
      from: context.provider,
      to: context.toProvider,
      occurredAt: context.time,
      reasons: [{ reason: context.reason, occurredAt: context.time }],
    });
  });
}

export class MetricReporter {
  private timer: ITimeout | undefined;
  private startTime: number | undefined;
  private readonly sdkToken: string | undefined;
  private performMetrics: Omit<PerformMetricsInput, 'eventType'>[] = [];
  private configHash: string | undefined;
  private anonymizedSuperJson: AnonymizedSuperJsonDocument | undefined;
  private readonly log: LogFunction | undefined;

  constructor(
    private readonly config: IConfig,
    private readonly timers: ITimers,
    private readonly fetchInstance: IFetch,
    crypto: ICrypto,
    superJson?: NormalizedSuperJsonDocument,
    logger?: ILogger
  ) {
    if (config.metricDebounceTimeMax < config.metricDebounceTimeMin) {
      throw new UnexpectedError(
        `Value of metricDebounceTimeMax (${config.metricDebounceTimeMax}) is lesser than value of metricDebounceTimeMin (${config.metricDebounceTimeMin})`
      );
    }
    this.sdkToken = config.sdkAuthToken;
    this.log = logger?.log(DEBUG_NAMESPACE);

    if (superJson) {
      this.configHash = hashSuperJson(superJson, crypto);
      this.anonymizedSuperJson = anonymizeSuperJson(superJson);
    }
  }

  public reportEvent(event: EventInput): void {
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
    const metrics = this.aggregateMetrics();
    if (metrics === undefined) {
      return;
    }
    this.performMetrics = [];
    this.startTime = undefined;
    if (this.timer !== undefined) {
      this.timers.clearTimeout(this.timer);
    }
    this.timer = undefined;
    this.sendEvent(metrics);
  }

  // Sets debounce timer, unless maximum debounce time elapsed
  private setTimer(): void {
    const now = this.timers.now();
    const timeHasElapsed =
      this.startTime !== undefined &&
      now - this.startTime >= this.config.metricDebounceTimeMax;
    // If this is the first request in a batch, set the batch start time for max debounce
    if (this.startTime === undefined) {
      this.startTime = now;
    }
    // If the max debounce time elapsed, do nothing - let the timer execute
    if (timeHasElapsed) {
      return;
    }
    // If the debounce time did not elapse, remove previous set timer
    if (this.timer !== undefined) {
      this.timers.clearTimeout(this.timer);
    }
    // Set the timer for min debounce time - it will execute unless another metric request comes
    this.timer = this.timers.setTimeout(() => {
      this.flush();
    }, this.config.metricDebounceTimeMin);
  }

  private reportSdkInitEvent(event: SDKInitInput): void {
    this.sendEvent(this.createSDKInitEventPayload(event));
  }

  private reportPerformMetricsEvent({
    eventType: _,
    ...metrics
  }: PerformMetricsInput): void {
    this.performMetrics.push(metrics);
    this.setTimer();
  }

  private reportProviderChangeEvent(event: ProviderChangeInput): void {
    this.sendEvent(this.createProviderChangeEventPayload(event));
  }

  private createSDKInitEventPayload(input: SDKInitInput): SDKInitEvent {
    return {
      event_type: 'SDKInit',
      occurred_at: input.occurredAt.toISOString(),
      configuration_hash: this.configHash,
      data: {
        configuration: this.anonymizedSuperJson,
      },
    };
  }

  private createProviderChangeEventPayload(
    input: ProviderChangeInput
  ): ProviderChangeEvent {
    return {
      event_type: 'ProviderChange',
      occurred_at: input.occurredAt.toISOString(),
      configuration_hash: this.configHash,
      data: {
        profile: input.profile,
        from_provider: input.from,
        to_provider: input.to,
        failover_reasons: input.reasons?.map(reason => ({
          reason: failurePolicyReasonToFailoverReason(reason.reason),
          occurred_at: reason.occurredAt.toISOString(),
        })),
      },
    };
  }

  private aggregateMetrics(): PerformMetricsEvent | undefined {
    if (this.performMetrics.length === 0) {
      return undefined;
    }
    const metrics: PerformMetricsEvent['data']['metrics'] = [];
    const dates = this.performMetrics.map(metric => metric.occurredAt).sort();
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
        type: 'PerformMetrics',
        profile,
        provider,
        successful_performs: successes,
        failed_performs: failures,
      });
    }

    return {
      event_type: 'Metrics',
      occurred_at: new Date(this.timers.now()).toISOString(),
      configuration_hash: this.configHash,
      data: {
        from,
        to,
        metrics,
      },
    };
  }

  // TODO: move this to other http calls
  private sendEvent(payload: SDKEvent) {
    const url = new URL('/insights/sdk_event', this.config.superfaceApiUrl)
      .href;
    void this.fetchInstance
      .fetch(url, {
        method: 'POST',
        body: stringBody(JSON.stringify(payload)),
        headers: {
          'content-type': JSON_CONTENT,
          ...(this.sdkToken !== undefined
            ? { authorization: `SUPERFACE-SDK-TOKEN ${this.sdkToken}` }
            : {}),
        },
      })
      .then(result => {
        this.log?.(
          'Succesfully sent metrics. Sent: %O',
          payload.data,
          'Response: %O',
          result
        );
      })
      .catch(error => {
        this.log?.('Unsuccesfully tried to send metrics: %O', error);
      });
  }
}
