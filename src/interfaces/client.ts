import type { SecurityValues } from '@superfaceai/ast';

import type { Events } from '../core/events';
import type { IProfile } from './profile';
import type { IProvider } from './provider';

export interface ISuperfaceClient {
  getProvider(
    providerName: string,
    options?: {
      parameters?: Record<string, string>;
      security?:
        | SecurityValues[]
        | { [id: string]: Omit<SecurityValues, 'id'> };
    }
  ): Promise<IProvider>;
  getProfile(
    profile: string | { id: string; version?: string }
  ): Promise<IProfile>;
  getProviderForProfile(profileId: string): Promise<IProvider>;
  on(...args: Parameters<Events['on']>): void;
}
