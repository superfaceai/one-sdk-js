import { SuperfaceClient } from './client';
import { Provider, ProviderConfiguration } from './provider';

//Mock client
jest.mock('./client');

describe('Provider Configuration', () => {
  it('should cache key correctly', async () => {
    const mockProviderConfiguration = new ProviderConfiguration('test', []);
    expect(mockProviderConfiguration.cacheKey).toEqual('{"provider":"test"}');
  });
});
describe('Provider', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('configures provider correctly', async () => {
    const mockClient = new SuperfaceClient();
    const mockProviderConfiguration = new ProviderConfiguration('test', []);
    const mockProvider = new Provider(mockClient, mockProviderConfiguration);

    await expect(mockProvider.configure()).resolves.toEqual(
      new Provider(mockClient, new ProviderConfiguration('test', []))
    );
  });
});
