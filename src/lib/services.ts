import { ProviderService } from '@superfaceai/ast';

export interface IServiceSelector {
  getUrl(serviceId?: string): string | undefined;
}

export class ServiceSelector implements IServiceSelector {
  private readonly serviceUrls: Record<string, string>;
  private readonly defaultService?: string;

  constructor(services: ProviderService[], defaultService?: string) {
    this.serviceUrls = Object.fromEntries(services.map(s => [s.id, s.baseUrl]));
    this.defaultService = defaultService;
  }

  public static empty(): ServiceSelector {
    return new ServiceSelector([]);
  }

  public static withDefaultUrl(baseUrl: string): ServiceSelector {
    return new ServiceSelector([{ id: 'default', baseUrl }], 'default');
  }

  /**
   * Gets the url of `serviceId`. If `serviceId` is undefined returns url of the default service, or undefined if default service is also undefined.
   */
  public getUrl(serviceId?: string): string | undefined {
    const service = serviceId ?? this.defaultService;
    if (service === undefined) {
      return undefined;
    }

    return this.serviceUrls[service];
  }
}
