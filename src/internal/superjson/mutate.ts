import { err, ok, Result } from '../../lib';
import { SDKExecutionError, UnexpectedError } from '../errors';
import { profileNotFoundError, providersNotSetError } from '../errors.helpers';
import {
  castToNonPrimitive,
  isEmptyRecord,
  mergeVariables,
} from '../interpreter/variables';
import { normalizeProfileSettings } from './normalize';
import {
  composeFileURI,
  isFileURIString,
  isVersionString,
  ProfileEntry,
  ProfileProviderDefaults,
  ProfileProviderEntry,
  ProfileProviderSettings,
  ProfileSettings,
  ProviderEntry,
  ProviderSettings,
  SecurityValues,
  SuperJsonDocument,
  trimFileURI,
  UsecaseDefaults,
} from './schema';

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
    if (targetedProfile.defaults) {
      //Merge existing with new
      defaults = mergeVariables(
        castToNonPrimitive(targetedProfile.defaults) || {},
        castToNonPrimitive(payload) || {}
      ) as UsecaseDefaults;
      document.profiles[profileName] = {
        ...targetedProfile,
        defaults,
      };

      return true;
    } else {
      document.profiles[profileName] = {
        ...targetedProfile,
        defaults: payload,
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
  payload: ProfileEntry
): boolean {
  // if specified profile is not found
  if (!document.profiles || !document.profiles[profileName]) {
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
        document.profiles[profileName] = composeFileURI(payload);

        return true;
      }

      document.profiles[profileName] = {
        file: trimFileURI(payload),
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
        //Merge existing with new
        defaults = mergeVariables(
          castToNonPrimitive(targetedProfile.defaults) || {},
          castToNonPrimitive(payload.defaults) || {}
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
      mergeProfileProvider(document, profileName, providerName, entry)
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

/**
 * Ensure that profile exists (defaults to version '0.0.0') and that its providers key is defined (defaults to empty record).
 */
function ensureProfileWithProviders(
  document: SuperJsonDocument,
  profileName: string
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
      []
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
  payload: ProfileProviderEntry
): boolean {
  const [_, targetProfile] = ensureProfileWithProviders(document, profileName);
  void _;

  const profileProvider = targetProfile.providers?.[providerName];

  // if specified profile provider is not found
  if (!profileProvider || !targetProfile.providers?.[providerName]) {
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
      targetProfile.providers[providerName] = composeFileURI(payload);
      targetProfile.priority = resolvePriorityAddition(
        targetProfile.priority,
        providerName
      );

      return true;
    }

    targetProfile.providers[providerName] = {
      file: trimFileURI(payload),
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
    //Change
    defaults = payload.defaults;
  } else {
    if (profileProvider.defaults && payload.defaults) {
      //Change
      //Merge existing with new
      defaults = mergeVariables(
        castToNonPrimitive(profileProvider.defaults) || {},
        castToNonPrimitive(payload.defaults) || {}
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

    if (payload.mapVariant) {
      mapProperties.mapVariant = payload.mapVariant;
    }
    if (payload.mapRevision) {
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

export function swapProfileProviderVariant(
  document: SuperJsonDocument,
  profileName: string,
  providerName: string,
  variant:
    | { kind: 'local'; file: string }
    | { kind: 'remote'; mapVariant?: string; mapRevision?: string }
): boolean {
  const [_, targetProfile] = ensureProfileWithProviders(document, profileName);
  void _;

  let changed = false;
  let targetProfileProvider = targetProfile.providers[providerName];

  if (variant.kind === 'local') {
    if (typeof targetProfileProvider === 'string') {
      // "provider": "path/to/map"
      changed = composeFileURI(variant.file) === targetProfileProvider;
      targetProfileProvider = composeFileURI(variant.file);
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
      targetProfileProvider = composeFileURI(variant.file);
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
  payload: ProviderEntry
): boolean {
  if (document.providers === undefined) {
    document.providers = {};
  }

  const targetProvider = document.providers[providerName] ?? {};
  if (typeof payload === 'string') {
    const isShorthandAvailable =
      typeof targetProvider === 'string' ||
      targetProvider.security === undefined ||
      targetProvider.security.length === 0;

    if (isFileURIString(payload)) {
      if (isShorthandAvailable) {
        document.providers[providerName] = composeFileURI(payload);
      } else {
        document.providers[providerName] = {
          file: trimFileURI(payload),
          // has to be an object because isShorthandAvailable is false
          security: (targetProvider as ProviderSettings).security,
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
    document.providers[providerName] = {
      file: payload.file ?? targetProvider.file,
      security: mergeSecurity(
        targetProvider.security ?? [],
        payload.security ?? []
      ),
    };
  }

  return true;
}

export function swapProviderVariant(
  document: SuperJsonDocument,
  providerName: string,
  variant: { kind: 'local'; file: string } | { kind: 'remote' }
): boolean {
  if (document.providers === undefined) {
    document.providers = {};
  }

  let changed = false;
  let targetProvider = document.providers[providerName];

  if (variant.kind === 'local') {
    if (typeof targetProvider === 'string') {
      changed = composeFileURI(variant.file) !== targetProvider;
      targetProvider = composeFileURI(variant.file);
    } else if (
      targetProvider === undefined ||
      targetProvider.security === undefined ||
      targetProvider.security.length === 0
    ) {
      changed = true;
      targetProvider = composeFileURI(variant.file);
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
  providersSortedByPriority: string[]
): Result<boolean, SDKExecutionError> {
  if (document.profiles === undefined) {
    document.profiles = {};
  }
  if (document.profiles[profileName] === undefined) {
    return err(profileNotFoundError(profileName));
  }

  let targetedProfile = document.profiles[profileName];

  //if specified profile has shorthand notation
  if (typeof targetedProfile === 'string') {
    document.profiles[profileName] = targetedProfile = normalizeProfileSettings(
      targetedProfile,
      Object.keys(document.providers ?? {})
    );
  }

  //check profile providers property
  const profileProviders = targetedProfile.providers;

  if (!profileProviders) {
    return err(providersNotSetError(profileName));
  }

  if (providersSortedByPriority.some(p => profileProviders[p] === undefined)) {
    return err(providersNotSetError(profileName));
  }
  //check providers property
  const providers = document.providers;

  if (!providers) {
    return err(providersNotSetError(profileName));
  }

  if (providersSortedByPriority.some(p => providers[p] === undefined)) {
    return err(providersNotSetError(profileName));
  }

  //check existing priority array
  const existingPriority = targetedProfile.priority ?? [];
  //Arrays are same
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
