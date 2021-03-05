import { ok, Result } from '../../lib';
import { Profile } from './profile';
import { UseCase } from './usecase';

describe('typed tests', () => {
	it('should correctly type profile.useCases', () => {
		// mock profile
		const p: Profile<{
			'sendSms': UseCase<{ number: number }, boolean>,
			'sayHello': UseCase<{ name: string }, string>
		}> = {
			useCases: {
				sendSms: {
					async perform(input: unknown) {
						return ok(input === 1);
					}
				},
				sayHello: {
					async perform(input: unknown) {
						return ok('Hello ' + input);
					}
				}
			}
		} as any;

		// test correct types
		expect<Promise<Result<boolean, unknown>>>(
			p.useCases.sendSms.perform({ number: 1 })
		).resolves.toEqual(
			ok(true)
		);

		expect<Promise<Result<string, unknown>>>(
			p.useCases.sayHello.perform({ name: 'John' })
		).resolves.toEqual(
			ok('Hello John')
		);
	});
});