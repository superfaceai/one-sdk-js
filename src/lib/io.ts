import { constants, promises as fsp } from 'fs';

export async function exists(path: string): Promise<boolean> {
  try {
    await fsp.access(path);
  } catch (err) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (err.code === 'ENOENT') {
      return false;
    }

    throw err;
  }

  return true;
}
/**
 * Returns `true` if directory or file
 * exists, is readable and is writable for the current user.
 */
export async function isAccessible(path: string): Promise<boolean> {
  try {
    await fsp.access(path, constants.F_OK | constants.R_OK | constants.W_OK);
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null) {
      if ('code' in err) {
        const ioErr = err as { code: string };
        if (ioErr.code === 'ENOENT' || ioErr.code === 'EACCES') {
          return false;
        }
      }
    }

    throw err;
  }

  return true;
}
