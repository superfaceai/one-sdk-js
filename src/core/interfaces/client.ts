import { Events } from '../events';
import { Profile } from '../profile';
import { Provider } from '../provider';

export interface ISuperfaceClient {
  getProfile(
    profile: string | { id: string; version?: string }
  ): Promise<Profile>;
  getProvider(providerName: string): Promise<Provider>;
  getProviderForProfile(profileId: string): Promise<Provider>;
  on(...args: Parameters<Events['on']>): void;
}
