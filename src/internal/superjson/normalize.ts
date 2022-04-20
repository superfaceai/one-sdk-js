import {
  BackoffKind,
  FILE_URI_PROTOCOL,
  isFileURIString,
  isVersionString,
  NormalizedProfileProviderDefaults,
  NormalizedProfileProviderSettings,
  NormalizedProfileSettings,
  NormalizedProviderSettings,
  NormalizedRetryPolicy,
  NormalizedSuperJsonDocument,
  NormalizedUsecaseDefaults,
  OnFail,
  ProfileEntry,
  ProfileProviderDefaults,
  ProfileProviderEntry,
  ProviderEntry,
  RetryPolicy,
  SuperJsonDocument,
  UsecaseDefaults,
} from '@superfaceai/ast';

import { resolveEnvRecord } from '../../lib/env';
import { clone } from '../../lib/object';
import { UnexpectedError } from '../errors';
import {
  invalidBackoffEntryError,
  invalidProfileProviderError,
} from '../errors.helpers';
import { castToNonPrimitive, mergeVariables } from '../interpreter/variables';

export function normalizeProfileProviderSettings(
  profileProviderSettings: ProfileProviderEntry | undefined,
  baseDefaults: NormalizedUsecaseDefaults
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
    profileProviderSettings.defaults,
    baseDefaults
  );

  return normalizedSettings;
}

export function normalizeRetryPolicy(
  retryPolicy?: RetryPolicy | undefined,
  base?: NormalizedRetryPolicy
): NormalizedRetryPolicy {
  if (retryPolicy === undefined) {
    if (base === undefined) {
      return { kind: OnFail.NONE };
    } else {
      return normalizeRetryPolicy(base);
    }
  }

  if (retryPolicy === OnFail.CIRCUIT_BREAKER) {
    return {
      kind: OnFail.CIRCUIT_BREAKER,
    };
  }

  if (
    retryPolicy === OnFail.NONE ||
    ('kind' in retryPolicy && retryPolicy.kind === OnFail.NONE)
  ) {
    return { kind: OnFail.NONE };
  }

  const baseOnFail = base?.kind === OnFail.NONE ? undefined : base;

  const normalizeBackoff = () => {
    if (retryPolicy.backoff === undefined) {
      return;
    }
    if (retryPolicy.backoff === BackoffKind.EXPONENTIAL) {
      return { kind: BackoffKind.EXPONENTIAL };
    }
    if (
      'kind' in retryPolicy.backoff &&
      retryPolicy.backoff.kind === BackoffKind.EXPONENTIAL
    ) {
      return {
        kind: BackoffKind.EXPONENTIAL,
        start: retryPolicy.backoff?.start ?? baseOnFail?.backoff?.start,
        factor: retryPolicy.backoff?.factor ?? baseOnFail?.backoff?.factor,
      };
    }
    throw invalidBackoffEntryError(retryPolicy.backoff.kind);
  };

  return {
    kind: OnFail.CIRCUIT_BREAKER,
    maxContiguousRetries:
      retryPolicy.maxContiguousRetries ?? baseOnFail?.maxContiguousRetries,
    requestTimeout: retryPolicy.requestTimeout ?? baseOnFail?.requestTimeout,
    backoff: normalizeBackoff(),
  };
}

export function normalizeUsecaseDefaults(
  defaults?: UsecaseDefaults,
  base?: NormalizedUsecaseDefaults
): NormalizedUsecaseDefaults {
  if (defaults === undefined) {
    if (base == undefined) {
      return {};
    } else {
      return normalizeUsecaseDefaults(base);
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

  return resolveEnvRecord(normalized);
}

export function normalizeProfileProviderDefaults(
  defaults?: ProfileProviderDefaults,
  base?: NormalizedUsecaseDefaults
): NormalizedProfileProviderDefaults {
  if (defaults === undefined) {
    if (base == undefined) {
      return {};
    } else {
      return normalizeProfileProviderDefaults(base);
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

  return resolveEnvRecord(normalized);
}

export function normalizeProfileSettings(
  profileEntry: ProfileEntry,
  topProviderOrder: string[]
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

  normalizedSettings.defaults = normalizeUsecaseDefaults(profileEntry.defaults);
  for (const [providerName, profileProviderSettings] of Object.entries(
    profileEntry.providers ?? {}
  )) {
    normalizedSettings.providers[providerName] =
      normalizeProfileProviderSettings(
        profileProviderSettings,
        normalizedSettings.defaults
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
  providerEntry: ProviderEntry
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
      providerEntry.security?.map(entry => resolveEnvRecord(entry)) ?? [],
    parameters: providerEntry.parameters
      ? resolveEnvRecord(providerEntry.parameters)
      : {},
  };
}

/** Returns a cached normalized clone of the document. */
export function normalizeSuperJsonDocument(
  originalDocument: SuperJsonDocument
): NormalizedSuperJsonDocument {
  // clone
  const document: SuperJsonDocument = clone(originalDocument);

  const profiles = document.profiles ?? {};
  const normalizedProfiles: Record<string, NormalizedProfileSettings> = {};
  const topProviderOrder = Object.keys(originalDocument.providers ?? {});
  for (const [profileId, profileEntry] of Object.entries(profiles)) {
    normalizedProfiles[profileId] = normalizeProfileSettings(
      profileEntry,
      topProviderOrder
    );
  }

  const providers = document.providers ?? {};
  const normalizedProviders: Record<string, NormalizedProviderSettings> = {};
  for (const [providerName, providerEntry] of Object.entries(providers)) {
    normalizedProviders[providerName] =
      normalizeProviderSettings(providerEntry);
  }

  return {
    profiles: normalizedProfiles,
    providers: normalizedProviders,
  };
}
