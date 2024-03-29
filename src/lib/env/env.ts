import type { IEnvironment, ILogger } from '../../interfaces';
import { clone } from '../object';

const DEBUG_NAMESPACE = 'lib/env';

/**
 * Attempts to resolve environment value.
 *
 * If the value starts with `$` character, it attempts to look it up in the environment variables.
 * If the value is not in environment or doesn't start with `$` it is returned as is.
 */
export function resolveEnv(
  str: string,
  environment: IEnvironment,
  logger?: ILogger
): string {
  let value = str;

  if (str.startsWith('$')) {
    const variable = str.slice(1);
    const env = environment.getString(variable);
    if (env !== undefined) {
      value = env;
    } else {
      logger?.log(DEBUG_NAMESPACE, `Enviroment variable ${variable} not found`);
    }
  }

  return value;
}

/**
 * Resolve environment values in a record recursively.
 *
 * Returns a clone of the of the original record with every string field replaced by the result of `resolveEnd(field)`.
 */
export function resolveEnvRecord<T extends Record<string, unknown>>(
  record: T,
  environment: IEnvironment,
  logger?: ILogger
): T {
  // If typed as `Partial<T>` typescript complains with "Type 'string' cannot be used to index type 'Partial<T>'. ts(2536)"
  const result: Partial<Record<string, unknown>> = {};

  for (const [key, value] of Object.entries(record)) {
    if (typeof value === 'string') {
      // replace strings
      result[key] = resolveEnv(value, environment, logger);
    } else if (typeof value === 'object' && value !== null) {
      // recurse objects
      result[key] = resolveEnvRecord(
        value as Record<string, unknown>,
        environment,
        logger
      );
    } else {
      if (value !== undefined) {
        // clone everything else
        result[key] = clone(value);
      }
    }
  }

  return result as T;
}
