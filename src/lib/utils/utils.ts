import { ProfileDocumentNode } from '@superfaceai/ast';

export function profileAstId(ast: ProfileDocumentNode): string {
  return ast.header.scope !== undefined
    ? ast.header.scope + '/' + ast.header.name
    : ast.header.name;
}

export function forceCast<T>(_: unknown): asserts _ is T {}
