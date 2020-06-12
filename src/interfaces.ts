export interface ParamDefinition {
  type: 'string' | 'number' | 'date' | 'datetime';
  description: string;
  examples: string | string[];
}

export interface ResultDefinition {
  type: 'string' | 'number' | 'date' | 'datetime';
  description: string;
  examples: string | string[];
}

export interface FunctionParams<T> {
  definitions: Record<keyof T, ParamDefinition>;
  params: T;
}

export interface FunctionResult<T> {
  definition: ResultDefinition;
  value: T;
}

export interface ProfileFunction<TParams = unknown, TResult = unknown> {
  title: string;
  parameters: FunctionParams<TParams>;
  result: FunctionResult<TResult>;
}

export interface MappingAST {}

export interface ProfileAST {}

export interface ParsedProfile {
  ast: ProfileAST;
  title: string;
  description: string;
  functions: Record<string, ProfileFunction>;
}
