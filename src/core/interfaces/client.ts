import { SecurityValues } from '@superfaceai/ast';

import { Events } from '../events';
import { Profile } from '../profile';
import { Provider } from '../provider';

export interface ISuperfaceClient {
  getProfile(profileId: string): Promise<Profile>;
  getProvider(
    providerName: string,
    options?: {
      parameters?: Record<string, string>;
      security?:
        | SecurityValues[]
        | { [id: string]: Omit<SecurityValues, 'id'> };
    }
  ): Promise<Provider>;
  getProviderForProfile(profileId: string): Promise<Provider>;
  on(...args: Parameters<Events['on']>): void;
}
