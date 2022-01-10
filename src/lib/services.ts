import { ProviderService } from '@superfaceai/ast';

export class ServicesSelector {
  private readonly serviceUrls: Record<string, string>;
  private readonly defaultService?: string;

  constructor(services: ProviderService[], defaultService?: string) {
    this.serviceUrls = Object.fromEntries(services.map(s => [s.id, s.baseUrl]));
    this.defaultService = defaultService;
  }

  static empty(): ServicesSelector {
    return new ServicesSelector([]);
  }

  static withDefaultUrl(baseUrl: string): ServicesSelector {
    return new ServicesSelector([{ id: 'default', baseUrl }], 'default');
  }

  /**
   * Gets the url of `service`. If `service` is undefined returns url of the default service, or undefined if default service is also undefined.
   */
  getUrl(service?: string): string | undefined {
    const srvc = service ?? this.defaultService;
    if (srvc === undefined) {
      return undefined;
    }

    return this.serviceUrls[srvc];
  }
}
