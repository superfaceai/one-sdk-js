import {
  FILE_URI_PROTOCOL,
  FILE_URI_REGEX,
  isFileURIString,
} from '@superfaceai/ast';

import { IFileSystem } from '~core';

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
