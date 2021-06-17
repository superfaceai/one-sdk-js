import { resolveEnvRecord } from '../../lib/env';
import { clone } from '../../lib/object';
import { castToNonPrimitive, mergeVariables } from '../interpreter/variables';
import {
  BackOffKind,
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
  OnFailKind,
  ProfileEntry,
  ProfileProviderDefaults,
  ProfileProviderEntry,
  ProviderEntry,
  RetryPolicy,
  SuperJsonDocument,
  UsecaseDefaults,
} from './schema';

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

    throw new Error(
      'invalid profile provider entry format: ' + profileProviderSettings
    );
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
      return { onFail: OnFail.NONE };
    } else {
      return normalizeRetryPolicy(base);
    }
  }

  if (retryPolicy.onFail === OnFail.NONE) {
    return { onFail: OnFail.NONE };
  }
  const baseOnFail = base?.onFail === OnFail.NONE ? undefined : base?.onFail;

  return {
    onFail: {
      kind: OnFailKind.CIRCUIT_BREAKER,
      maxContiguousRetries:
        retryPolicy.onFail.maxContiguousRetries ??
        baseOnFail?.maxContiguousRetries,
      requestTimeout:
        retryPolicy.onFail.requestTimeout ?? baseOnFail?.requestTimeout,
      backoff: {
        kind: BackOffKind.EXPONENTIAL,
        start: retryPolicy.onFail.backoff?.start ?? baseOnFail?.backoff.start,
        factor:
          retryPolicy.onFail.backoff?.factor ?? baseOnFail?.backoff.factor,
      },
    },
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

    normalized[usecase] = {
      input: mergeVariables(
        previousInput,
        castToNonPrimitive(defs.input) ?? {}
      ),
      //FIX: how should we actually normalize this?
      providerFailover:
        !normalized[usecase]?.providerFailover && !defs.providerFailover
          ? false
          : true,
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
  profileEntry: ProfileEntry
): NormalizedProfileSettings {
  if (typeof profileEntry === 'string') {
    if (isVersionString(profileEntry)) {
      return {
        version: profileEntry,
        priority: [],
        defaults: {},
        providers: {},
      };
    }

    if (isFileURIString(profileEntry)) {
      return {
        file: profileEntry.slice(FILE_URI_PROTOCOL.length),
        priority: [],
        defaults: {},
        providers: {},
      };
    }

    throw new Error('invalid profile entry format: ' + profileEntry);
  }

  let normalizedSettings: NormalizedProfileSettings;
  if ('file' in profileEntry) {
    normalizedSettings = {
      file: profileEntry.file,
      priority: profileEntry.priority ?? [],
      defaults: {},
      providers: {},
    };
  } else {
    normalizedSettings = {
      version: profileEntry.version,
      priority: profileEntry.priority ?? [],
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
      };
    }

    throw new Error('invalid provider entry format: ' + providerEntry);
  }

  return {
    file: providerEntry.file,
    security:
      providerEntry.security?.map(entry => resolveEnvRecord(entry)) ?? [],
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
  for (const [profileId, profileEntry] of Object.entries(profiles)) {
    normalizedProfiles[profileId] = normalizeProfileSettings(profileEntry);
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
