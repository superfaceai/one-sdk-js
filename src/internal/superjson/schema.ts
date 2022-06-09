import {
  FILE_URI_PROTOCOL,
  FILE_URI_REGEX,
  isFileURIString,
} from '@superfaceai/ast';

export const trimFileURI = (path: string): string =>
  path.replace(FILE_URI_REGEX, '');

export const composeFileURI = (path: string): string => {
  if (isFileURIString(path)) {
    return path;
  }

  return path.startsWith('../')
    ? `${FILE_URI_PROTOCOL}${path}`
    : `${FILE_URI_PROTOCOL}./${path}`;
};
