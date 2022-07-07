import type {
  BackoffPolicy,
  NormalizedBackoffPolicy,
  NormalizedProfileProviderDefaults,
  NormalizedProfileProviderSettings,
  NormalizedProfileSettings,
  NormalizedProviderSettings,
  NormalizedRetryPolicy,
  NormalizedSuperJsonDocument,
  NormalizedUsecaseDefaults,
  ProfileEntry,
  ProfileProviderDefaults,
  ProfileProviderEntry,
  ProviderEntry,
  RetryPolicy,
  SuperJsonDocument,
  UsecaseDefaults} from '@superfaceai/ast';
import {
  BackoffKind,
  FILE_URI_PROTOCOL,
  isFileURIString,
  isVersionString,
  OnFail
} from '@superfaceai/ast';

import type { IEnvironment, ILogger } from '../../interfaces';
import {
  castToNonPrimitive,
  clone,
  mergeVariables,
  resolveEnvRecord,
  UnexpectedError,
} from '../../lib';
import { invalidProfileProviderError } from './errors.helpers';

export function normalizeProfileProviderSettings(
  profileProviderSettings: ProfileProviderEntry | undefined,
  baseDefaults: NormalizedUsecaseDefaults,
  environment: IEnvironment,
  logger?: ILogger
): NormalizedProfileProviderSettings {
  if (profileProviderSettings === undefined) {
    return {
      defaults: {},
    };
  }

  if (typeof profileProviderSettings === 'string') {
    if (isFileURIString(profileProviderSettings)) {
      return {
        file: profileProviderSettings.slice(FILE_URI_PROTOCOL.length),
        defaults: {},
      };
    }

    throw invalidProfileProviderError(profileProviderSettings);
  }

  let normalizedSettings: NormalizedProfileProviderSettings;
  if ('file' in profileProviderSettings) {
    normalizedSettings = {
      file: profileProviderSettings.file,
      defaults: {},
    };
  } else {
    normalizedSettings = {
      mapVariant: profileProviderSettings.mapVariant,
      mapRevision: profileProviderSettings.mapRevision,
      defaults: {},
    };
  }
  normalizedSettings.defaults = normalizeProfileProviderDefaults(
    environment,
    logger,
    profileProviderSettings.defaults,
    baseDefaults
  );

  return normalizedSettings;
}

export function normalizeBackoff(
  backoff?: BackoffPolicy,
  base?: NormalizedBackoffPolicy
): NormalizedBackoffPolicy {
  if (backoff === undefined) {
    if (base === undefined) {
      return { kind: BackoffKind.EXPONENTIAL };
    } else {
      return normalizeBackoff(base);
    }
  }

  // string-to-object expansion
  let objectBackoff: Exclude<BackoffPolicy, BackoffKind>;
  if (backoff === BackoffKind.EXPONENTIAL) {
    objectBackoff = { kind: BackoffKind.EXPONENTIAL };
  } else {
    objectBackoff = backoff;
  }

  return {
    kind: BackoffKind.EXPONENTIAL,
    start: objectBackoff.start ?? base?.start,
    factor: objectBackoff.factor ?? base?.factor,
  };
}

export function normalizeRetryPolicy(
  retryPolicy?: RetryPolicy,
  base?: NormalizedRetryPolicy
): NormalizedRetryPolicy {
  if (retryPolicy === undefined) {
    if (base === undefined) {
      return { kind: OnFail.NONE };
    } else {
      return normalizeRetryPolicy(base);
    }
  }

  // string-to-object expansion - always fully override base
  let objectRetryPolicy: Exclude<RetryPolicy, OnFail>;
  if (retryPolicy === OnFail.CIRCUIT_BREAKER) {
    objectRetryPolicy = { kind: OnFail.CIRCUIT_BREAKER };
  } else if (retryPolicy === OnFail.SIMPLE) {
    objectRetryPolicy = { kind: OnFail.SIMPLE };
  } else if (retryPolicy === OnFail.NONE) {
    objectRetryPolicy = { kind: OnFail.NONE };
  } else {
    objectRetryPolicy = retryPolicy;
  }

  if (objectRetryPolicy.kind === OnFail.SIMPLE) {
    if (base?.kind === OnFail.SIMPLE) {
      objectRetryPolicy.maxContiguousRetries ??= base.maxContiguousRetries;
      objectRetryPolicy.requestTimeout ??= base.requestTimeout;
    }

    return objectRetryPolicy;
  }

  if (objectRetryPolicy.kind === OnFail.CIRCUIT_BREAKER) {
    let normalizedBackoff: NormalizedBackoffPolicy;
    if (base?.kind === OnFail.CIRCUIT_BREAKER) {
      objectRetryPolicy.maxContiguousRetries ??= base.maxContiguousRetries;
      objectRetryPolicy.requestTimeout ??= base.requestTimeout;
      objectRetryPolicy.openTime ??= base.openTime;
      normalizedBackoff = normalizeBackoff(
        objectRetryPolicy.backoff,
        base.backoff
      );
    } else {
      normalizedBackoff = normalizeBackoff(objectRetryPolicy.backoff);
    }

    return {
      ...objectRetryPolicy,
      backoff: normalizedBackoff,
    };
  }

  return objectRetryPolicy;
}

export function normalizeUsecaseDefaults(
  environment: IEnvironment,
  logger?: ILogger,
  defaults?: UsecaseDefaults,
  base?: NormalizedUsecaseDefaults
): NormalizedUsecaseDefaults {
  if (defaults === undefined) {
    if (base == undefined) {
      return {};
    } else {
      return normalizeUsecaseDefaults(environment, logger, base);
    }
  }

  const normalized: NormalizedUsecaseDefaults =
    base !== undefined ? clone(base) : {};
  for (const [usecase, defs] of Object.entries(defaults)) {
    const previousInput = castToNonPrimitive(normalized[usecase]?.input) ?? {};

    let providerFailover = defs.providerFailover;
    if (providerFailover === undefined) {
      providerFailover = normalized[usecase]?.providerFailover;
    }

    normalized[usecase] = {
      input: mergeVariables(
        previousInput,
        castToNonPrimitive(defs.input) ?? {}
      ),
      providerFailover: providerFailover ?? false,
    };
  }

  return resolveEnvRecord(normalized, environment, logger);
}

export function normalizeProfileProviderDefaults(
  environment: IEnvironment,
  logger?: ILogger,
  defaults?: ProfileProviderDefaults,
  base?: NormalizedUsecaseDefaults
): NormalizedProfileProviderDefaults {
  if (defaults === undefined) {
    if (base == undefined) {
      return {};
    } else {
      return normalizeProfileProviderDefaults(environment, logger, base);
    }
  }

  const normalized: NormalizedProfileProviderDefaults = {};
  for (const [usecase, defs] of Object.entries(defaults)) {
    const previousInput = castToNonPrimitive(base?.[usecase]?.input) ?? {};

    normalized[usecase] = {
      input: mergeVariables(
        previousInput,
        castToNonPrimitive(defs.input) ?? {}
      ),
      retryPolicy: normalizeRetryPolicy(defs.retryPolicy),
    };
  }

  return resolveEnvRecord(normalized, environment, logger);
}

export function normalizeProfileSettings(
  profileEntry: ProfileEntry,
  topProviderOrder: string[],
  environment: IEnvironment,
  logger?: ILogger
): NormalizedProfileSettings {
  if (typeof profileEntry === 'string') {
    if (isVersionString(profileEntry)) {
      return {
        version: profileEntry,
        priority: topProviderOrder,
        defaults: {},
        providers: {},
      };
    }

    if (isFileURIString(profileEntry)) {
      return {
        file: profileEntry.slice(FILE_URI_PROTOCOL.length),
        priority: topProviderOrder,
        defaults: {},
        providers: {},
      };
    }

    throw new UnexpectedError('Invalid profile entry format: ' + profileEntry);
  }

  let normalizedSettings: NormalizedProfileSettings;
  if ('file' in profileEntry) {
    normalizedSettings = {
      file: profileEntry.file,
      priority: profileEntry.priority || [],
      defaults: {},
      providers: {},
    };
  } else {
    normalizedSettings = {
      version: profileEntry.version,
      priority: profileEntry.priority || [],
      defaults: {},
      providers: {},
    };
  }

  normalizedSettings.defaults = normalizeUsecaseDefaults(
    environment,
    logger,
    profileEntry.defaults
  );
  for (const [providerName, profileProviderSettings] of Object.entries(
    profileEntry.providers ?? {}
  )) {
    normalizedSettings.providers[providerName] =
      normalizeProfileProviderSettings(
        profileProviderSettings,
        normalizedSettings.defaults,
        environment,
        logger
      );
  }
  if (normalizedSettings.priority.length === 0) {
    const providerOrder = Object.keys(profileEntry.providers || {});
    normalizedSettings.priority =
      providerOrder.length > 0 ? providerOrder : topProviderOrder;
  }

  if (normalizedSettings.priority.length === 0) {
    const providerOrder = Object.keys(profileEntry.providers || {});
    normalizedSettings.priority =
      providerOrder.length > 0 ? providerOrder : topProviderOrder;
  }

  return normalizedSettings;
}

export function normalizeProviderSettings(
  providerEntry: ProviderEntry,
  environment: IEnvironment,
  logger?: ILogger
): NormalizedProviderSettings {
  if (typeof providerEntry === 'string') {
    if (isFileURIString(providerEntry)) {
      return {
        file: providerEntry.slice(FILE_URI_PROTOCOL.length),
        security: [],
        parameters: {},
      };
    }

    throw new UnexpectedError(
      'Invalid provider entry format: ' + providerEntry
    );
  }

  return {
    file: providerEntry.file,
    security:
      providerEntry.security?.map(entry =>
        resolveEnvRecord(entry, environment, logger)
      ) ?? [],
    parameters: providerEntry.parameters
      ? resolveEnvRecord(providerEntry.parameters, environment, logger)
      : {},
  };
}

/** Returns a cached normalized clone of the document. */
export function normalizeSuperJsonDocument(
  originalDocument: SuperJsonDocument,
  environment: IEnvironment,
  logger?: ILogger
): NormalizedSuperJsonDocument {
  const document: SuperJsonDocument = clone(originalDocument);

  const profiles = document.profiles ?? {};
  const normalizedProfiles: Record<string, NormalizedProfileSettings> = {};
  const topProviderOrder = Object.keys(originalDocument.providers ?? {});
  for (const [profileId, profileEntry] of Object.entries(profiles)) {
    normalizedProfiles[profileId] = normalizeProfileSettings(
      profileEntry,
      topProviderOrder,
      environment,
      logger
    );
  }

  const providers = document.providers ?? {};
  const normalizedProviders: Record<string, NormalizedProviderSettings> = {};
  for (const [providerName, providerEntry] of Object.entries(providers)) {
    normalizedProviders[providerName] = normalizeProviderSettings(
      providerEntry,
      environment,
      logger
    );
  }

  return {
    profiles: normalizedProfiles,
    providers: normalizedProviders,
  };
}
