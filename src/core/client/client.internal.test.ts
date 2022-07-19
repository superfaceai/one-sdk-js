import { resolveProfileId } from './client.internal';

describe('InternalClient', () => {
  describe('resolveProfileId', () => {
    describe('when passing profileId as string', () => {
      it('returns correct id and version', async () => {
        expect(resolveProfileId('scope/name@1.2.3-test')).toEqual({
          id: 'scope/name',
          version: '1.2.3-test',
        });
      });

      it('returns correct id', async () => {
        expect(resolveProfileId('scope/name')).toEqual({
          id: 'scope/name',
          version: undefined,
        });
      });

      it('throws on missing minor version', async () => {
        expect(() => resolveProfileId('scope/name@1')).toThrow();
      });

      it('throws on missing patch version', async () => {
        expect(() => resolveProfileId('scope/name@1.2')).toThrow();
      });
    });

    describe('when passing profileId as object', () => {
      it('returns correct id and version', async () => {
        expect(
          resolveProfileId({ id: 'scope/name', version: '1.2.3-test' })
        ).toEqual({
          id: 'scope/name',
          version: '1.2.3-test',
        });
      });

      it('returns correct id', async () => {
        expect(resolveProfileId({ id: 'scope/name' })).toEqual({
          id: 'scope/name',
          version: undefined,
        });
      });

      it('throws on missing minor version', async () => {
        expect(() =>
          resolveProfileId({ id: 'scope/name', version: '1' })
        ).toThrow();
      });

      it('throws on missing patch version', async () => {
        expect(() =>
          resolveProfileId({ id: 'scope/name', version: '1.2' })
        ).toThrow();
      });
    });
  });
});
