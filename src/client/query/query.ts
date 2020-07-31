import { ProfileDocumentNode } from '@superindustries/language';

interface QueryNumber {
  lt?: number;
  gt?: number;
  eq?: number;
}

interface QueryString {
  match?: RegExp | string;
  equal?: string;
}

interface QueryInputParameter {
  respected?: boolean;
}

interface QueryResultProperty {
  present?: boolean;
}

interface QueryAST {
  profileAST: ProfileDocumentNode;
}

type QueryParameter =
  | QueryNumber
  | QueryString
  | QueryInputParameter
  | QueryResultProperty
  | QueryAST;

export type Query = Record<string, QueryParameter> & {
  // TODO: It's fake!
  ast?: QueryAST;
};
