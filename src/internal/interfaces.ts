import { Result } from '..';
import { BoundProvider, Provider, Query } from '../client';
import { FunctionParams, FunctionResult, ParsedProfile } from '../interfaces';
import {
  ParamsValidationError,
  ScriptCompilationError,
  ScriptInputError
} from './errors';

export interface ProviderBinder {
  bind(profile: ParsedProfile): BoundProvider;
}

export interface ProfileFetcher {
  fetch(url: string): ParsedProfile;
}

export interface ProfileProvider {
  provider: Provider;
  mappingURL: string;
  profileURL: string;
}

export interface PerformContext {
  variables: object;
}

export interface ScriptAST {}

export interface ScriptInterpreter {
  compileScript(script: string): Result<ScriptAST, ScriptCompilationError>;
  executeScript(
    script: ScriptAST,
    inputs: unknown
  ): Result<unknown, ScriptInputError>;
}

export interface Performer {
  perform<TParams, TResult>(
    profile: ParsedProfile,
    params: FunctionParams<TParams>
  ): FunctionResult<TResult>;
}

export interface ParamsValidator {
  validate<T>(
    params: FunctionParams<T>
  ): Result<FunctionParams<T>, ParamsValidationError>;
}

export interface ProviderFinder {
  find(query: Query): Provider;
}
