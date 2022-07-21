import { SecurityValues } from '@superfaceai/ast';

import { Events } from '../events';
import { Profile } from '../profile';
import { Provider } from '../provider';

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
