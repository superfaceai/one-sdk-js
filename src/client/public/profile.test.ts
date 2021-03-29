import { ok, Result } from '../../lib';
import { Profile, ProfileConfiguration } from './profile';
import { UseCase } from './usecase';
import { SuperfaceClient } from './client';

//Mock client
jest.mock('./client');

describe('Profile Configuration', () => {

  it('should cache key correctly', async () => {
    const mockProfileConfiguration = new ProfileConfiguration('test', '1.0.0')
    expect(mockProfileConfiguration.cacheKey).toEqual(JSON.stringify(mockProfileConfiguration))
  });

});

describe('Profile', () => {

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should call getUseCases correctly', async () => {
    const mockClient = new SuperfaceClient();
    const mockProfileConfiguration = new ProfileConfiguration('test', '1.0.0')

    const profile = new Profile(mockClient, mockProfileConfiguration)

    expect(profile.getUseCase('sayHello')).toEqual(new UseCase(profile, 'sayHello'))
  });

  it('should get useCases correctly', async () => {
    const mockClient = new SuperfaceClient();
    const mockProfileConfiguration = new ProfileConfiguration('test', '1.0.0')

    const profile = new Profile(mockClient, mockProfileConfiguration)

    expect(() => profile.useCases).toThrowError(new Error('Thou shall not access the typed interface from untyped Profile'))
  });

});

describe('typed tests', () => {
  it('should correctly type profile.useCases', async () => {
    // mock profile
    const p: Profile<{
      sendSms: UseCase<{ number: number }, boolean>;
      sayHello: UseCase<{ name: string }, string>;
    }> = {
      useCases: {
        sendSms: {
          async perform(input: unknown) {
            return ok((input as any).number === 1);
          },
        },
        sayHello: {
          async perform(input: unknown) {
            return ok('Hello ' + (input as { name: string }).name);
          },
        },
      },
    } as any;

    // test correct types
    await expect<Promise<Result<boolean, unknown>>>(
      p.useCases.sendSms.perform({ number: 1 })
    ).resolves.toEqual(ok(true));

    await expect<Promise<Result<string, unknown>>>(
      p.useCases.sayHello.perform({ name: 'John' })
    ).resolves.toEqual(ok('Hello John'));
  });
});
