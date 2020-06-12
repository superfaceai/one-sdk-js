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

type QueryParameter =
  | QueryNumber
  | QueryString
  | QueryInputParameter
  | QueryResultProperty;

export type Query = Record<string, QueryParameter>;
