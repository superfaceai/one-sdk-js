import { Provider, ProviderConfiguration } from './provider';

describe('Provider', () => {
  it('configures provider correctly', async () => {
    const mockProviderConfiguration = new ProviderConfiguration('test', []);
    const mockProvider = new Provider(mockProviderConfiguration);

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
    const mockProviderConfiguration = new ProviderConfiguration(
      'test',
      mockSecurity
    );
    const mockProvider = new Provider(mockProviderConfiguration);

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
