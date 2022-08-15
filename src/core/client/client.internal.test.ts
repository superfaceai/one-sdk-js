import { invalidIdentifierIdError, invalidVersionError } from '../errors';
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
        expect(() => resolveProfileId('scope/name@1')).toThrow(
          invalidVersionError('1', 'minor')
        );
      });

      it('throws on missing patch version', async () => {
        expect(() => resolveProfileId('scope/name@1.2')).toThrow(
          invalidVersionError('1.2', 'patch')
        );
      });

      it('throws on invalid scope', async () => {
        expect(() => resolveProfileId('scop:7_!e/name@1.0.0')).toThrow(
          invalidIdentifierIdError('scop:7_!e', 'Scope')
        );
      });

      it('throws on invalid name', async () => {
        expect(() => resolveProfileId('scope/nam.:_-e@1.0.0')).toThrow(
          invalidIdentifierIdError('nam.:_-e', 'Name')
        );
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
        ).toThrow(invalidVersionError('1', 'minor'));
      });

      it('throws on missing patch version', async () => {
        expect(() =>
          resolveProfileId({ id: 'scope/name', version: '1.2' })
        ).toThrow(invalidVersionError('1.2', 'patch'));
      });

      it('throws on invalid scope', async () => {
        expect(() =>
          resolveProfileId({ id: 'scop:7_!e/name', version: '1.2.3' })
        ).toThrow(invalidIdentifierIdError('scop:7_!e', 'Scope'));
      });

      it('throws on invalid name', async () => {
        expect(() =>
          resolveProfileId({ id: 'scope/nam.:_-e', version: '1.2.3' })
        ).toThrow(invalidIdentifierIdError('nam.:_-e', 'Name'));
      });
    });
  });
});
