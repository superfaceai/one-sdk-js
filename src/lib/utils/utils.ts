import type { ProfileDocumentNode } from '@superfaceai/ast';

export function profileAstId(ast: ProfileDocumentNode): string {
  return ast.header.scope !== undefined
    ? ast.header.scope + '/' + ast.header.name
    : ast.header.name;
}

export function versionToString(version: {
  major: number;
  minor: number;
  patch: number;
  label?: string;
}): string {
  let versionString = `${version.major}.${version.minor}.${version.patch}`;

  if (version.label !== undefined) {
    versionString += `-${version.label}`;
  }

  return versionString;
}

export function forceCast<T>(_: unknown): asserts _ is T {}

export function isSettingsWithAst<T>(input: T): input is T & { ast: unknown } {
  return typeof input === 'object' && input !== null && 'ast' in input;
}
