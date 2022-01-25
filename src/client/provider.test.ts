import { SuperfaceClient } from './client';
import { Provider, ProviderConfiguration } from './provider';

//Mock client
jest.mock('./client');

describe('Provider Configuration', () => {
  it('should cache key correctly', async () => {
    const mockProviderConfiguration = new ProviderConfiguration('test', []);
    expect(mockProviderConfiguration.cacheKey).toEqual(
      JSON.stringify(mockProviderConfiguration)
    );
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

    await expect(
      mockProvider.configure({
        security: [
          {
            username: 'second',
            password: 'seconds',
            id: 'second-id',
          },
        ],
      })
    ).resolves.toEqual(
      new Provider(
        mockClient,
        new ProviderConfiguration('test', [
          {
            username: 'second',
            password: 'seconds',
            id: 'second-id',
          },
        ])
      )
    );
  });

  it('configures provider correctly and merges configuration', async () => {
    const mockSecurity = [
      { id: 'first-id', username: 'digest-user', password: 'digest-password' },
    ];
    const mockClient = new SuperfaceClient();
    const mockProviderConfiguration = new ProviderConfiguration(
      'test',
      mockSecurity
    );
    const mockProvider = new Provider(mockClient, mockProviderConfiguration);

    await expect(
      mockProvider.configure({
        security: [
          {
            username: 'second',
            password: 'seconds',
            id: 'second-id',
          },
        ],
      })
    ).resolves.toEqual(
      new Provider(
        mockClient,
        new ProviderConfiguration('test', [
          {
            id: 'first-id',
            username: 'digest-user',
            password: 'digest-password',
          },
          {
            username: 'second',
            password: 'seconds',
            id: 'second-id',
          },
        ])
      )
    );
  });
});
