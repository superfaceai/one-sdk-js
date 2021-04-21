import { SuperfaceClient } from './client';
import { Profile, ProfileConfiguration } from './profile';
import { UseCase } from './usecase';

//Mock client
jest.mock('./client');

describe('Profile Configuration', () => {
  it('should cache key correctly', async () => {
    const mockProfileConfiguration = new ProfileConfiguration('test', '1.0.0');
    expect(mockProfileConfiguration.cacheKey).toEqual(
      JSON.stringify(mockProfileConfiguration)
    );
  });
});

describe('Profile', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should call getUseCases correctly', async () => {
    const mockClient = new SuperfaceClient();
    const mockProfileConfiguration = new ProfileConfiguration('test', '1.0.0');

    const profile = new Profile(mockClient, mockProfileConfiguration);

    expect(profile.getUseCase('sayHello')).toEqual(
      new UseCase(profile, 'sayHello')
    );
  });
});
