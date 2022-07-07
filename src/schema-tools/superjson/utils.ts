import type { SuperJsonDocument } from '@superfaceai/ast';
import {
  assertSuperJsonDocument,
  FILE_URI_PROTOCOL,
  FILE_URI_REGEX,
  isFileURIString,
} from '@superfaceai/ast';

import type { IFileSystem, ILogger } from '../../interfaces';
import type { Result, SDKExecutionError } from '../../lib';
import { ensureErrorSubclass, err, ok } from '../../lib';
import {
  superJsonFormatError,
  superJsonNotAFileError,
  superJsonNotFoundError,
  superJsonReadError,
} from './errors.helpers';

const DEBUG_NAMESPACE = 'superjson';

export const SUPERFACE_DIR = 'superface';
export const META_FILE = 'super.json';

/**
 * Detects the existence of a `super.json` file in specified number of levels
 * of parent directories.
 *
 * @param cwd - currently scanned working directory
 *
 * Returns relative path to a directory where `super.json` is detected.
 */
export async function detectSuperJson(
  cwd: string,
  fileSystem: IFileSystem,
  level?: number
): Promise<string | undefined> {
  // check whether super.json is accessible in cwd
  if (await fileSystem.isAccessible(fileSystem.path.join(cwd, META_FILE))) {
    return fileSystem.path.normalize(
      fileSystem.path.relative(fileSystem.path.cwd(), cwd)
    );
  }

  // check whether super.json is accessible in cwd/superface
  if (
    await fileSystem.isAccessible(
      fileSystem.path.join(cwd, SUPERFACE_DIR, META_FILE)
    )
  ) {
    return fileSystem.path.normalize(
      fileSystem.path.relative(
        fileSystem.path.cwd(),
        fileSystem.path.join(cwd, SUPERFACE_DIR)
      )
    );
  }

  // default behaviour - do not scan outside cwd
  if (level === undefined || level < 1) {
    return undefined;
  }

  // check if user has permissions outside cwd
  cwd = fileSystem.path.join(cwd, '..');
  if (!(await fileSystem.isAccessible(cwd))) {
    return undefined;
  }

  return await detectSuperJson(cwd, fileSystem, --level);
}

export function parseSuperJson(
  input: unknown
): Result<SuperJsonDocument, SDKExecutionError> {
  try {
    const superdocument = assertSuperJsonDocument(input);

    return ok(superdocument);
  } catch (e: unknown) {
    return err(superJsonFormatError(ensureErrorSubclass(e)));
  }
}

export function loadSuperJsonSync(
  path: string,
  fileSystem: IFileSystem,
  logger?: ILogger
): Result<SuperJsonDocument, SDKExecutionError> {
  try {
    if (!fileSystem.sync.isAccessible(path)) {
      return err(superJsonNotFoundError(path));
    }

    if (!fileSystem.sync.isFile(path)) {
      return err(superJsonNotAFileError(path));
    }
  } catch (e: unknown) {
    return err(superJsonNotFoundError(path, ensureErrorSubclass(e)));
  }

  let superjson: unknown;
  const superraw = fileSystem.sync.readFile(path);
  if (superraw.isOk()) {
    superjson = JSON.parse(superraw.value);
  } else {
    return err(superJsonReadError(ensureErrorSubclass(superraw.error)));
  }

  const superdocument = parseSuperJson(superjson);
  if (superdocument.isErr()) {
    return err(superdocument.error);
  }

  logger?.log(DEBUG_NAMESPACE, `loaded super.json from ${path}`);

  return superdocument;
}

/**
 * Attempts to load super.json file from expected location `cwd/superface/super.json`
 */
export async function loadSuperJson(
  path: string,
  fileSystem: IFileSystem,
  logger?: ILogger
): Promise<Result<SuperJsonDocument, SDKExecutionError>> {
  try {
    if (!(await fileSystem.isAccessible(path))) {
      return err(superJsonNotFoundError(path));
    }

    if (!(await fileSystem.isFile(path))) {
      return err(superJsonNotAFileError(path));
    }
  } catch (e: unknown) {
    return err(superJsonNotFoundError(path, ensureErrorSubclass(e)));
  }

  let superjson: unknown;
  const superraw = await fileSystem.readFile(path);
  if (superraw.isOk()) {
    superjson = JSON.parse(superraw.value);
  } else {
    return err(superJsonReadError(ensureErrorSubclass(superraw.error)));
  }

  const superdocument = parseSuperJson(superjson);
  if (superdocument.isErr()) {
    return err(superdocument.error);
  }

  logger?.log(DEBUG_NAMESPACE, `loaded super.json from ${path}`);

  return superdocument;
}

export const trimFileURI = (path: string): string =>
  path.replace(FILE_URI_REGEX, '');

export const composeFileURI = (
  path: string,
  normalize: IFileSystem['path']['normalize']
): string => {
  if (isFileURIString(path)) {
    return path;
  }

  const normalized = normalize(path);

  return path.startsWith('../')
    ? `${FILE_URI_PROTOCOL}${normalized}`
    : `${FILE_URI_PROTOCOL}./${normalized}`;
};
