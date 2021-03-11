import { ok, Result } from '../../lib';
import { Profile } from './profile';
import { UseCase } from './usecase';

describe('typed tests', () => {
  it('should correctly type profile.useCases', async () => {
    // mock profile
    const p: Profile<{
      sendSms: UseCase<{ number: number }, boolean>;
      sayHello: UseCase<{ name: string }, string>;
    }> = {
      useCases: {
        sendSms: {
          // eslint-disable-next-line @typescript-eslint/require-await
          async perform(input: unknown) {
            return ok(input === 1);
          },
        },
        sayHello: {
          // eslint-disable-next-line @typescript-eslint/require-await
          async perform(input: unknown) {
            return ok('Hello ' + (input as string));
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
