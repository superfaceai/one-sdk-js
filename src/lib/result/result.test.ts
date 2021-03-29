import { Err, err, Ok, ok, Result } from './result';

describe('Result wrappers', () => {
  describe('when using Ok', () => {
    type MockValueType = { test: string };
    const mockValue: MockValueType = { test: 'test' };
    const mockOk = new Ok(mockValue);

    it('checks is ok correctly', () => {
      expect(mockOk.isOk()).toEqual(true);
    });

    it('checks is err correctly', () => {
      expect(mockOk.isErr()).toEqual(false);
    });

    it('maps value correctly', () => {
      expect(mockOk.map((value: MockValueType) => value.test)).toEqual({
        value: 'test',
      });
    });

    it('maps err correctly', () => {
      expect(mockOk.mapErr((e: unknown) => e)).toEqual({
        value: { test: 'test' },
      });
    });

    it('matches value correctly', () => {
      expect(
        mockOk.match(
          (t: MockValueType) => t.test,
          (e: unknown) => e
        )
      ).toEqual('test');
    });

    it('uses andThen correctly', () => {
      expect(mockOk.andThen((t: MockValueType) => ok(t.test))).toEqual({
        value: 'test',
      });
    });

    it('unwraps correctly', () => {
      expect(mockOk.unwrap()).toEqual({ test: 'test' });
    });

    it('maps async correctly', async () => {
      await expect(
        mockOk.mapAsync(
          (value: MockValueType) =>
            new Promise((resolve: (value: string) => void) => {
              resolve(value.test);
            })
        )
      ).resolves.toEqual({ value: 'test' });
    });

    it('maps err async correctly', async () => {
      await expect(
        mockOk.mapErrAsync(
          () =>
            new Promise((resolve: (value: string) => void) => {
              resolve('test');
            })
        )
      ).resolves.toEqual(ok(mockValue));
    });

    it('maps then async correctly', async () => {
      await expect(
        mockOk.andThenAsync(
          (t: MockValueType) =>
            new Promise(
              (resolve: (value: Result<unknown, unknown>) => void) => {
                resolve(ok(t));
              }
            )
        )
      ).resolves.toEqual(ok(mockValue));
    });
  });

  describe('when using Err', () => {
    type MockValueType = { name: string; message: string };
    const mockError: MockValueType = { name: 'test', message: 'test' };
    const mockErr = new Err(mockError);

    it('checks is ok correctly', () => {
      expect(mockErr.isOk()).toEqual(false);
    });

    it('checks is err correctly', () => {
      expect(mockErr.isErr()).toEqual(true);
    });

    it('maps value correctly', () => {
      expect(mockErr.map((t: unknown) => t)).toEqual(
        err({ name: 'test', message: 'test' })
      );
    });

    it('maps err correctly', () => {
      expect(mockErr.mapErr((e: unknown) => e)).toEqual({
        error: { name: 'test', message: 'test' },
      });
    });

    it('matches value correctly', () => {
      expect(
        mockErr.match(
          (t: unknown) => t,
          (e: unknown) => e
        )
      ).toEqual({ name: 'test', message: 'test' });
    });

    it('uses andThen correctly', () => {
      expect(
        mockErr.andThen(() => err({ name: 'test', message: 'inner' }))
      ).toEqual({ error: { name: 'test', message: 'test' } });
    });

    it('unwraps correctly', () => {
      expect(() => mockErr.unwrap()).toThrowError(mockError);
    });

    it('maps async correctly', async () => {
      await expect(
        mockErr.mapAsync(
          () =>
            new Promise((reject: (error: MockValueType) => void) => {
              reject({ name: 'test', message: 'inner' });
            })
        )
      ).resolves.toEqual(err({ name: 'test', message: 'test' }));
    });

    it('maps err async correctly', async () => {
      await expect(
        mockErr.mapErrAsync(
          (t: MockValueType) =>
            new Promise((resolve: (error: MockValueType) => void) => {
              resolve(t);
            })
        )
      ).resolves.toEqual(err(mockError));
    });

    it('maps then async correctly', async () => {
      await expect(
        mockErr.andThenAsync(
          () =>
            new Promise(
              (reject: (value: Result<unknown, MockValueType>) => void) => {
                reject(err(mockError));
              }
            )
        )
      ).resolves.toEqual(err(mockError));
    });
  });
});
