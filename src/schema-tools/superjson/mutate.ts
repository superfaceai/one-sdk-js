import type {
  ProfileEntry,
  ProfileProviderDefaults,
  ProfileProviderEntry,
  ProfileProviderSettings,
  ProfileSettings,
  ProviderEntry,
  ProviderSettings,
  SecurityValues,
  SuperJsonDocument,
  UsecaseDefaults,
} from '@superfaceai/ast';
import { isFileURIString, isVersionString } from '@superfaceai/ast';

import type { SDKExecutionError } from '../../core';
import { UnexpectedError } from '../../core';
import type { IEnvironment, IFileSystem, ILogger } from '../../interfaces';
import type { Result } from '../../lib';
import {
  castToNonPrimitive,
  err,
  isEmptyRecord,
  mergeVariables,
  ok,
} from '../../lib';
import { profileNotFoundError, providersNotSetError } from './errors.helpers';
import { normalizeProfileSettings } from './normalize';
import { composeFileURI, trimFileURI } from './utils';

/** Merges profile defaults into the document or creates the profile if it doesn't exist. */
export function mergeProfileDefaults(
  document: SuperJsonDocument,
  profileName: string,
  payload: UsecaseDefaults
): boolean {
  // if specified profile is not found
  if (document.profiles === undefined) {
    document.profiles = {};
  }
  if (document.profiles[profileName] === undefined) {
    document.profiles[profileName] = '0.0.0';
  }

  const targetedProfile = document.profiles[profileName];

  // if specified profile has shorthand notation
  let defaults: UsecaseDefaults | undefined;
  if (typeof targetedProfile === 'string') {
    defaults = payload;

    if (isVersionString(targetedProfile)) {
      document.profiles[profileName] = {
        version: targetedProfile,
        defaults,
      };

      return true;
    }

    if (isFileURIString(targetedProfile)) {
      document.profiles[profileName] = {
        file: targetedProfile,
        defaults,
      };

      return true;
    }
  } else {
    if (targetedProfile.defaults === undefined) {
      document.profiles[profileName] = {
        ...targetedProfile,
        defaults: payload,
      };

      return true;
    } else {
      // Merge existing with new
      defaults = mergeVariables(
        castToNonPrimitive(targetedProfile.defaults),
        castToNonPrimitive(payload)
      ) as UsecaseDefaults;
      document.profiles[profileName] = {
        ...targetedProfile,
        defaults,
      };

      return true;
    }
  }

  return false;
}

/** Merges profile into the document or creates it if it doesn't exist. */
export function mergeProfile(
  document: SuperJsonDocument,
  profileName: string,
  payload: ProfileEntry,
  filesystem: IFileSystem,
  environment?: IEnvironment,
  logger?: ILogger
): boolean {
  // if specified profile is not found
  if (
    document.profiles === undefined ||
    document.profiles[profileName] === undefined
  ) {
    document.profiles = {
      ...document.profiles,
      [profileName]: payload,
    };

    return true;
  }

  const targetedProfile = document.profiles[profileName];

  // Priority #1: shorthand notation - file URI or semantic version
  if (typeof payload === 'string') {
    const isShorthandAvailable =
      typeof targetedProfile === 'string' ||
      (isEmptyRecord(targetedProfile.defaults ?? {}) &&
        isEmptyRecord(targetedProfile.providers ?? {}));

    const commonProperties: Partial<ProfileSettings> = {};
    if (typeof targetedProfile !== 'string') {
      if (targetedProfile.providers) {
        commonProperties.providers = targetedProfile.providers;
      }
      if (targetedProfile.defaults) {
        commonProperties.defaults = targetedProfile.defaults;
      }
    }

    // when specified profile is file URI in shorthand notation
    if (isFileURIString(payload)) {
      if (isShorthandAvailable) {
        document.profiles[profileName] = composeFileURI(
          payload,
          filesystem.path.normalize
        );

        return true;
      }

      document.profiles[profileName] = {
        file: filesystem.path.normalize(trimFileURI(payload)),
        ...commonProperties,
      };

      return true;
    }

    // when specified profile is version in shorthand notation
    if (isVersionString(payload)) {
      if (isShorthandAvailable) {
        document.profiles[profileName] = payload;

        return true;
      }

      document.profiles[profileName] = {
        version: payload,
        ...commonProperties,
      };

      return true;
    }

    throw new UnexpectedError('Invalid string payload format');
  }

  // Priority #2: keep previous structure and merge
  let defaults: UsecaseDefaults | undefined;
  let priority: string[] | undefined;
  if (typeof targetedProfile === 'string') {
    defaults = payload.defaults;
  } else {
    if (targetedProfile.defaults) {
      if (!payload.defaults) {
        defaults = targetedProfile.defaults;
      } else {
        // Merge existing with new
        defaults = mergeVariables(
          castToNonPrimitive(targetedProfile.defaults ?? {}),
          castToNonPrimitive(payload.defaults ?? {})
        ) as UsecaseDefaults;
      }
    }
    if (targetedProfile.priority) {
      priority = targetedProfile.priority;
    }
  }

  let providers: Record<string, ProfileProviderEntry> | undefined;
  if (typeof targetedProfile === 'string') {
    providers = payload.providers;
  } else if (targetedProfile.providers) {
    Object.entries(payload.providers ?? {}).forEach(([providerName, entry]) =>
      mergeProfileProvider(
        document,
        profileName,
        providerName,
        entry,
        filesystem,
        environment,
        logger
      )
    );
    providers = targetedProfile.providers;
  }

  document.profiles[profileName] = {
    ...payload,
    priority,
    defaults,
    providers,
  };

  return true;
}

function resolvePriorityAddition(
  existingPriority: string[] | undefined,
  newProvider: string
): string[] {
  if (!existingPriority || existingPriority.length === 0) {
    return [newProvider];
  }
  if (!existingPriority.includes(newProvider)) {
    return [...existingPriority, newProvider];
  }

  return existingPriority;
}

/** Sets profile of the document to payload or deletes it. */
export function setProfile(
  document: SuperJsonDocument,
  profileName: string,
  payload: ProfileEntry | undefined,
  environment: IEnvironment,
  filesystem: IFileSystem,
  logger?: ILogger
): boolean {
  let changed = false;

  // delete any existing profile
  if (document.profiles !== undefined && profileName in document.profiles) {
    changed = true;
    delete document.profiles[profileName];

    if (Object.keys(document.profiles).length === 0) {
      delete document.profiles;
    }
  }

  // if payload is undefined we already deleted it (or it wasn't present)
  if (payload !== undefined) {
    const mergeChanged = mergeProfile(
      document,
      profileName,
      payload,
      filesystem,
      environment,
      logger
    );
    changed = changed || mergeChanged;
  }

  return changed;
}

/**
 * Ensure that profile exists (defaults to version '0.0.0') and that its providers key is defined (defaults to empty record).
 */
function ensureProfileWithProviders(
  document: SuperJsonDocument,
  profileName: string,
  environment?: IEnvironment,
  logger?: ILogger
): [
  boolean,
  Exclude<ProfileEntry, string> & {
    providers: Record<string, ProfileProviderEntry>;
  }
] {
  let changed = false;

  if (document.profiles === undefined) {
    document.profiles = {};

    changed = true;
  }
  if (document.profiles[profileName] === undefined) {
    document.profiles[profileName] = {
      version: '0.0.0',
      providers: {},
    };

    changed = true;
  }

  const profile = document.profiles[profileName];
  if (typeof profile === 'string') {
    document.profiles[profileName] = normalizeProfileSettings(
      document.profiles[profileName],
      [],
      environment,
      logger
    );

    changed = true;
  } else if (profile.providers === undefined) {
    profile.providers = {};

    changed = true;
  }

  const ensuredProfile = document.profiles[profileName] as Exclude<
    ProfileEntry,
    string
  > & { providers: Record<string, ProfileProviderEntry> };

  return [changed, ensuredProfile];
}

/** Merges profile provider into the document or creates the profile and providers object if it doesn't exist. */
export function mergeProfileProvider(
  document: SuperJsonDocument,
  profileName: string,
  providerName: string,
  payload: ProfileProviderEntry,
  fileSystem: IFileSystem,
  environment?: IEnvironment,
  logger?: ILogger
): boolean {
  const [_, targetProfile] = ensureProfileWithProviders(
    document,
    profileName,
    environment,
    logger
  );
  void _;

  const profileProvider = targetProfile.providers?.[providerName];

  // if specified profile provider is not found
  if (
    profileProvider === undefined ||
    targetProfile.providers?.[providerName] === undefined
  ) {
    targetProfile.providers = {
      ...targetProfile.providers,
      [providerName]: payload,
    };

    targetProfile.priority = resolvePriorityAddition(
      targetProfile.priority,
      providerName
    );

    return true;
  }

  // Priority #1: shorthand notation - file URI
  // when specified profile provider is file URI shorthand notation
  if (typeof payload === 'string') {
    if (
      typeof profileProvider === 'string' ||
      isEmptyRecord(profileProvider.defaults ?? {})
    ) {
      targetProfile.providers[providerName] = composeFileURI(
        payload,
        fileSystem.path.normalize
      );
      targetProfile.priority = resolvePriorityAddition(
        targetProfile.priority,
        providerName
      );

      return true;
    }

    targetProfile.providers[providerName] = {
      file: fileSystem.path.normalize(trimFileURI(payload)),
      defaults: profileProvider.defaults,
    };
    targetProfile.priority = resolvePriorityAddition(
      targetProfile.priority,
      providerName
    );

    return true;
  }

  // Priority #2: keep previous structure and merge
  let defaults: ProfileProviderDefaults | undefined;
  if (typeof profileProvider === 'string') {
    // Change
    defaults = payload.defaults;
  } else {
    if (profileProvider.defaults && payload.defaults) {
      // Change
      // Merge existing with new
      defaults = mergeVariables(
        castToNonPrimitive(profileProvider.defaults ?? {}),
        castToNonPrimitive(payload.defaults ?? {})
      ) as ProfileProviderDefaults;
    } else if (!profileProvider.defaults && payload.defaults) {
      defaults = payload.defaults;
    }
  }
  // if there no other keys and we changed defaults
  if (
    !('file' in payload) &&
    !('mapVariant' in payload) &&
    !('mapRevision' in payload) &&
    defaults
  ) {
    targetProfile.providers[providerName] = {
      ...(typeof profileProvider === 'string'
        ? { file: profileProvider }
        : profileProvider),
      defaults,
    };
    targetProfile.priority = resolvePriorityAddition(
      targetProfile.priority,
      providerName
    );

    return true;
  }

  // when specified profile provider has file & defaults
  if ('file' in payload) {
    targetProfile.providers[providerName] = {
      ...payload,
      defaults,
    };
    targetProfile.priority = resolvePriorityAddition(
      targetProfile.priority,
      providerName
    );

    return true;
  }

  // when specified profile provider has mapVariant, mapRevision & defaults
  if ('mapVariant' in payload || 'mapRevision' in payload) {
    if (typeof profileProvider === 'string') {
      targetProfile.providers[providerName] = {
        ...payload,
        defaults,
      };
      targetProfile.priority = resolvePriorityAddition(
        targetProfile.priority,
        providerName
      );

      return true;
    }

    const mapProperties: Partial<
      Extract<ProfileProviderSettings, { mapVariant?: string }>
    > = 'file' in profileProvider ? {} : profileProvider;

    if (payload.mapVariant !== undefined) {
      mapProperties.mapVariant = payload.mapVariant;
    }
    if (payload.mapRevision !== undefined) {
      mapProperties.mapRevision = payload.mapRevision;
    }

    targetProfile.providers[providerName] = {
      ...mapProperties,
      defaults,
    };
    targetProfile.priority = resolvePriorityAddition(
      targetProfile.priority,
      providerName
    );

    return true;
  }

  return false;
}

/** Sets profile provider of the document to payload or deletes it. */
export function setProfileProvider(
  document: SuperJsonDocument,
  profileName: string,
  providerName: string,
  payload: ProfileProviderEntry | undefined,
  filesystem: IFileSystem,
  environment?: IEnvironment,
  logger?: ILogger
): boolean {
  let changed = false;

  // delete any existing profile provider
  if (document.profiles !== undefined && profileName in document.profiles) {
    const profile = document.profiles[profileName];
    if (
      typeof profile !== 'string' &&
      profile.providers !== undefined &&
      providerName in profile.providers
    ) {
      changed = true;
      delete profile.providers[providerName];

      // remove from priority, but only if we are actually deleting
      // otherwise preserve the priority order
      if (payload === undefined) {
        if (profile.priority !== undefined) {
          const index = profile.priority.indexOf(providerName);
          if (index >= 0) {
            profile.priority.splice(index, 1);
          }

          if (profile.priority.length === 0) {
            delete profile.priority;
          }
        }
      }

      if (Object.keys(profile.providers).length === 0) {
        delete profile.providers;
      }
    }
  }

  // if payload is undefined we already deleted it (or it wasn't present)
  if (payload !== undefined) {
    const mergeChanged = mergeProfileProvider(
      document,
      profileName,
      providerName,
      payload,
      filesystem,
      environment,
      logger
    );
    changed = changed || mergeChanged;
  }

  return changed;
}

export function swapProfileProviderVariant(
  document: SuperJsonDocument,
  profileName: string,
  providerName: string,
  variant:
    | { kind: 'local'; file: string }
    | { kind: 'remote'; mapVariant?: string; mapRevision?: string },
  filesystem: IFileSystem,
  environment?: IEnvironment,
  logger?: ILogger
): boolean {
  const [_, targetProfile] = ensureProfileWithProviders(
    document,
    profileName,
    environment,
    logger
  );
  void _;

  let changed = false;
  let targetProfileProvider = targetProfile.providers[providerName];

  if (variant.kind === 'local') {
    if (typeof targetProfileProvider === 'string') {
      // "provider": "path/to/map"
      changed =
        composeFileURI(variant.file, filesystem.path.normalize) ===
        targetProfileProvider;
      targetProfileProvider = composeFileURI(
        variant.file,
        filesystem.path.normalize
      );
    } else if (
      targetProfileProvider === undefined ||
      targetProfileProvider.defaults === undefined ||
      Object.keys(targetProfileProvider.defaults).length === 0
    ) {
      // "provider": { "file": "path/to/map" } | {}
      changed =
        targetProfileProvider === undefined ||
        !(
          'file' in targetProfileProvider &&
          targetProfileProvider.file === variant.file
        );
      targetProfileProvider = composeFileURI(
        variant.file,
        filesystem.path.normalize
      );
    } else {
      // "provider": { "file": "path/to/map", "defaults": <non-empty> } | { "defaults": <non-empty> }
      changed = !(
        'file' in targetProfileProvider &&
        targetProfileProvider.file === variant.file
      );
      targetProfileProvider = {
        file: variant.file,
        defaults: targetProfileProvider.defaults,
      };
    }
  } else if (variant.kind === 'remote') {
    if (
      targetProfileProvider === undefined ||
      typeof targetProfileProvider === 'string'
    ) {
      changed = true;
      targetProfileProvider = {
        mapVariant: variant.mapVariant,
        mapRevision: variant.mapRevision,
      };
    } else if ('file' in targetProfileProvider) {
      changed = true;
      targetProfileProvider = {
        mapVariant: variant.mapVariant,
        mapRevision: variant.mapRevision,
        defaults: targetProfileProvider.defaults,
      };
    } else {
      changed =
        targetProfileProvider.mapVariant !== variant.mapVariant ||
        targetProfileProvider.mapRevision !== variant.mapRevision;
      targetProfileProvider = {
        mapVariant: variant.mapVariant,
        mapRevision: variant.mapRevision,
        defaults: targetProfileProvider.defaults,
      };
    }
  }

  if (changed) {
    targetProfile.providers[providerName] = targetProfileProvider;
  }

  return changed;
}

/** Merges provider into the document or creates it if it doesn't exist. */
export function mergeProvider(
  document: SuperJsonDocument,
  providerName: string,
  payload: ProviderEntry,
  filesystem: IFileSystem
): boolean {
  if (document.providers === undefined) {
    document.providers = {};
  }

  const targetProvider = document.providers[providerName] ?? {};
  if (typeof payload === 'string') {
    const isShorthandAvailable =
      typeof targetProvider === 'string' ||
      targetProvider.security === undefined ||
      targetProvider.security.length === 0 ||
      targetProvider.parameters === undefined ||
      Object.keys(targetProvider.parameters).length === 0;

    if (isFileURIString(payload)) {
      if (isShorthandAvailable) {
        document.providers[providerName] = composeFileURI(
          payload,
          filesystem.path.normalize
        );
      } else {
        document.providers[providerName] = {
          file: filesystem.path.normalize(trimFileURI(payload)),
          // has to be an object because isShorthandAvailable is false
          security: (targetProvider as ProviderSettings).security,
          parameters: (targetProvider as ProviderSettings).parameters,
        };
      }

      return true;
    }

    throw new UnexpectedError('Invalid string payload format');
  }

  if (typeof targetProvider === 'string') {
    document.providers[providerName] = {
      file: targetProvider,
      ...payload,
    };
  } else {
    const provider: ProviderSettings = {};

    if (payload.file !== undefined || targetProvider.file !== undefined) {
      provider.file = payload.file ?? targetProvider.file;
    }

    if (
      targetProvider.security !== undefined ||
      payload.security !== undefined
    ) {
      provider.security = mergeSecurity(
        targetProvider.security ?? [],
        payload.security ?? []
      );
    }

    if (
      targetProvider.parameters !== undefined ||
      payload.parameters !== undefined
    ) {
      provider.parameters = Object.assign(
        targetProvider.parameters || {},
        payload.parameters || {}
      );
    }

    document.providers[providerName] = provider;
  }

  return true;
}

/** Sets provider of the document to payload or deletes it. */
export function setProvider(
  document: SuperJsonDocument,
  providerName: string,
  payload: ProviderEntry | undefined,
  filesystem: IFileSystem
): boolean {
  let changed = false;

  // delete any existing provider
  if (document.providers !== undefined && providerName in document.providers) {
    changed = true;
    delete document.providers[providerName];

    if (Object.keys(document.providers).length === 0) {
      delete document.providers;
    }
  }

  // if payload is undefined we already deleted it (or it wasn't present)
  if (payload !== undefined) {
    const mergeChanged = mergeProvider(
      document,
      providerName,
      payload,
      filesystem
    );
    changed = changed || mergeChanged;
  }

  return changed;
}

export function swapProviderVariant(
  document: SuperJsonDocument,
  providerName: string,
  variant: { kind: 'local'; file: string } | { kind: 'remote' },
  filesystem: IFileSystem
): boolean {
  if (document.providers === undefined) {
    document.providers = {};
  }

  let changed = false;
  let targetProvider = document.providers[providerName];

  if (variant.kind === 'local') {
    if (typeof targetProvider === 'string') {
      changed =
        composeFileURI(variant.file, filesystem.path.normalize) !==
        targetProvider;
      targetProvider = composeFileURI(variant.file, filesystem.path.normalize);
    } else if (
      targetProvider === undefined ||
      targetProvider.security === undefined ||
      targetProvider.security.length === 0
    ) {
      changed = true;
      targetProvider = composeFileURI(variant.file, filesystem.path.normalize);
    } else {
      changed = variant.file !== targetProvider.file;
      targetProvider.file = variant.file;
    }
  } else if (variant.kind === 'remote') {
    if (typeof targetProvider === 'string' || targetProvider === undefined) {
      changed = true;
      targetProvider = {};
    } else if ('file' in targetProvider) {
      changed = true;
      delete targetProvider.file;
    }
  }

  if (changed) {
    document.providers[providerName] = targetProvider;
  }

  return changed;
}

export function mergeSecurity(
  left: SecurityValues[],
  right: SecurityValues[]
): SecurityValues[] {
  const result: SecurityValues[] = [];

  for (const entry of left) {
    result.push(entry);
  }

  for (const entry of right) {
    const index = result.findIndex(item => item.id === entry.id);

    if (index !== -1) {
      result[index] = entry;
    } else {
      result.push(entry);
    }
  }

  return result;
}

/** Sets priority array to the new values. */
export function setPriority(
  document: SuperJsonDocument,
  profileName: string,
  providersSortedByPriority: string[] | undefined,
  environment: IEnvironment,
  logger?: ILogger
): Result<boolean, SDKExecutionError> {
  if (document.profiles === undefined) {
    document.profiles = {};
  }
  if (document.profiles[profileName] === undefined) {
    return err(profileNotFoundError(profileName));
  }

  let targetedProfile = document.profiles[profileName];

  // if specified profile has shorthand notation
  if (typeof targetedProfile === 'string') {
    document.profiles[profileName] = targetedProfile = normalizeProfileSettings(
      targetedProfile,
      Object.keys(document.providers ?? {}),
      environment,
      logger
    );
  }

  // check profile providers property
  const profileProviders = targetedProfile.providers;

  if (!profileProviders) {
    return err(providersNotSetError(profileName));
  }

  if (providersSortedByPriority === undefined) {
    delete targetedProfile.priority;

    return ok(true);
  }

  if (providersSortedByPriority.some(p => profileProviders[p] === undefined)) {
    return err(providersNotSetError(profileName));
  }
  // check providers property
  const providers = document.providers;

  if (!providers) {
    return err(providersNotSetError(profileName));
  }

  if (providersSortedByPriority.some(p => providers[p] === undefined)) {
    return err(providersNotSetError(profileName));
  }

  // check existing priority array
  const existingPriority = targetedProfile.priority ?? [];
  // Arrays are same
  if (
    providersSortedByPriority.length === existingPriority.length &&
    providersSortedByPriority.every(
      (value: string, index: number) => value === existingPriority[index]
    )
  ) {
    return ok(false);
  }

  targetedProfile.priority = providersSortedByPriority;

  return ok(true);
}
