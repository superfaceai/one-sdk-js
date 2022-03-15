import { SuperJson } from '../internal';
import { ok } from '../lib';
import { SuperfaceClient } from './client';
import { Profile, ProfileConfiguration, TypedProfile } from './profile';
import { UseCase } from './usecase';

//Mock SuperJson static side
const mockLoadSync = jest.fn();

describe('Profile Configuration', () => {
  it('should cache key correctly', async () => {
    const mockProfileConfiguration = new ProfileConfiguration('test', '1.0.0');
    expect(mockProfileConfiguration.cacheKey).toEqual(
      JSON.stringify(mockProfileConfiguration)
    );
  });
});

describe('Profile', () => {
  const mockSuperJson = new SuperJson({
    profiles: {
      test: {
        version: '1.0.0',
        providers: {
          first: {
            file: '../some.suma',
          },
          second: {
            file: '../some.suma',
          },
        },
      },
    },
    providers: {
      first: {
        file: '../provider.json',
      },
    },
  });
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should call getUseCases correctly', async () => {
    mockLoadSync.mockReturnValue(ok(mockSuperJson));
    SuperJson.loadSync = mockLoadSync;
    const mockClient = new SuperfaceClient();
    const mockProfileConfiguration = new ProfileConfiguration('test', '1.0.0');

    const profile = new Profile(mockClient, mockProfileConfiguration);

    expect(profile.getUseCase('sayHello')).toEqual(
      new UseCase(profile, 'sayHello')
    );
  });

  it('should call getConfiguredProviders correctly', async () => {
    mockLoadSync.mockReturnValue(ok(mockSuperJson));
    SuperJson.loadSync = mockLoadSync;
    const mockClient = new SuperfaceClient();
    const mockProfileConfiguration = new ProfileConfiguration('test', '1.0.0');

    const profile = new Profile(mockClient, mockProfileConfiguration);

    expect(profile.getConfiguredProviders()).toEqual(['first', 'second']);
  });
});

describe('TypedProfile', () => {
  const mockSuperJson = new SuperJson({
    profiles: {
      test: {
        version: '1.0.0',
      },
    },
    providers: {},
  });
  afterEach(() => {
    jest.resetAllMocks();
  });
  beforeEach(() => {
    mockLoadSync.mockReturnValue(ok(mockSuperJson));
    SuperJson.loadSync = mockLoadSync;
  });
  describe('getUseCases', () => {
    it('should get usecase correctly', async () => {
      const mockClient = new SuperfaceClient();
      const mockProfileConfiguration = new ProfileConfiguration(
        'test',
        '1.0.0'
      );

      const typedProfile = new TypedProfile(
        mockClient,
        mockProfileConfiguration,
        ['sayHello']
      );

      expect(typedProfile.getUseCase('sayHello')).toEqual(
        new UseCase(typedProfile, 'sayHello')
      );
    });

    it('should throw when usecase is not found', async () => {
      const mockClient = new SuperfaceClient();
      const mockProfileConfiguration = new ProfileConfiguration(
        'test',
        '1.0.0'
      );

      const typedProfile = new TypedProfile(
        mockClient,
        mockProfileConfiguration,
        ['sayHello']
      );

      expect(() => typedProfile.getUseCase('nope')).toThrow(
        new RegExp('Usecase not found: "nope"')
      );
    });
  });
});
