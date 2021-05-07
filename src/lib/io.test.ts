import { promises as fsp } from 'fs';
import { mocked } from 'ts-jest/utils';

import { exists, isAccessible } from './io';

jest.mock('fs', () => ({
  ...jest.requireActual<Record<string, unknown>>('fs'),
  promises: {
    access: jest.fn(),
  },
}));
describe('io', () => {
  describe('when checking if file exists', () => {
    it('returns true if path exists', async () => {
      mocked(fsp.access).mockResolvedValue();
      await expect(exists('superface')).resolves.toEqual(true);
    }, 10000);

    it('returns false if fs access throws ENOENT', async () => {
      mocked(fsp.access).mockRejectedValue({ code: 'ENOENT' });
      await expect(exists('some/made/up/file.json')).resolves.toEqual(false);
    }, 10000);

    it('throws if fs access throws', async () => {
      mocked(fsp.access).mockRejectedValue(new Error('test'));
      await expect(exists('some/made/up/file.json')).rejects.toEqual(
        new Error('test')
      );
    }, 10000);
  });

  describe('when checking if the given path is accessible', () => {
    it('returns true if path is accessible', async () => {
      mocked(fsp.access).mockResolvedValue();
      await expect(isAccessible('superface')).resolves.toEqual(true);
    }, 10000);

    it('returns false if fs access throws ENOENT', async () => {
      mocked(fsp.access).mockRejectedValue({ code: 'ENOENT' });
      await expect(isAccessible('some/made/up/file.json')).resolves.toEqual(
        false
      );
    }, 10000);

    it('returns false if fs access throws EACCES', async () => {
      mocked(fsp.access).mockRejectedValue({ code: 'EACCES' });
      await expect(isAccessible('some/made/up/file.json')).resolves.toEqual(
        false
      );
    }, 10000);

    it('throws if fs access throws', async () => {
      mocked(fsp.access).mockRejectedValue(new Error('test'));
      await expect(isAccessible('some/made/up/file.json')).rejects.toEqual(
        new Error('test')
      );
    }, 10000);
  });
});
