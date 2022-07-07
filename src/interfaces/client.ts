import type { SecurityValues } from '@superfaceai/ast';

import type { Events } from '../core/events';
import type { Profile } from '../core/profile';
import type { Provider } from '../core/provider';

export interface ISuperfaceClient {
  getProvider(
    providerName: string,
    options?: {
      parameters?: Record<string, string>;
      security?:
        | SecurityValues[]
        | { [id: string]: Omit<SecurityValues, 'id'> };
    }
  ): Promise<Provider>;
  getProfile(
    profile: string | { id: string; version?: string }
  ): Promise<Profile>;
  getProviderForProfile(profileId: string): Promise<Provider>;
  on(...args: Parameters<Events['on']>): void;
}
