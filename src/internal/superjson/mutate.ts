import { err, ok, Result } from '../../lib';
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

export function addProfileDefaults(
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
export function addProfile(
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

    throw new Error('Invalid string payload format');
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
      addProfileProvider(document, profileName, providerName, entry)
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

export function addProfileProvider(
  document: SuperJsonDocument,
  profileName: string,
  providerName: string,
  payload: ProfileProviderEntry
): boolean {
  if (document.profiles === undefined) {
    document.profiles = {};
  }
  if (document.profiles[profileName] === undefined) {
    document.profiles[profileName] = '0.0.0';
  }

  let targetedProfile = document.profiles[profileName];

  // if specified profile has shorthand notation
  if (typeof targetedProfile === 'string') {
    document.profiles[profileName] = targetedProfile = normalizeProfileSettings(
      targetedProfile,
      [providerName]
    );

    targetedProfile.providers = {
      [providerName]: payload,
    };

    return true;
  }

  const profileProvider = targetedProfile.providers?.[providerName];

  // if specified profile provider is not found
  if (!profileProvider || !targetedProfile.providers?.[providerName]) {
    targetedProfile.providers = {
      ...targetedProfile.providers,
      [providerName]: payload,
    };

    targetedProfile.priority = [
      ...(targetedProfile.priority || []),
      providerName,
    ];

    return true;
  }

  // Priority #1: shorthand notation - file URI
  // when specified profile provider is file URI shorthand notation
  if (typeof payload === 'string') {
    if (
      typeof profileProvider === 'string' ||
      isEmptyRecord(profileProvider.defaults ?? {})
    ) {
      targetedProfile.providers[providerName] = composeFileURI(payload);

      return true;
    }

    targetedProfile.providers[providerName] = {
      file: trimFileURI(payload),
      defaults: profileProvider.defaults,
    };

    return true;
  }

  // Priority #2: keep previous structure and merge
  let defaults: ProfileProviderDefaults | undefined;
  if (typeof profileProvider === 'string') {
    defaults = payload.defaults;
  } else if (profileProvider.defaults) {
    if (!payload.defaults) {
      defaults = targetedProfile.defaults;
    } else {
      //Merge existing with new
      defaults = mergeVariables(
        castToNonPrimitive(profileProvider.defaults) || {},
        castToNonPrimitive(payload.defaults) || {}
      ) as ProfileProviderDefaults;
    }
  }

  // when specified profile provider has file & defaults
  if ('file' in payload) {
    targetedProfile.providers[providerName] = {
      ...payload,
      defaults,
    };

    return true;
  }

  // when specified profile provider has mapVariant, mapRevision & defaults
  if ('mapVariant' in payload || 'mapRevision' in payload) {
    if (typeof profileProvider === 'string') {
      targetedProfile.providers[providerName] = {
        ...payload,
        defaults,
      };

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

    targetedProfile.providers[providerName] = {
      ...mapProperties,
      defaults,
    };

    return true;
  }

  return false;
}

export function addProvider(
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
      targetProvider.security?.length === 0;

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

    throw new Error('Invalid string payload format');
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

export function addPriority(
  document: SuperJsonDocument,
  profileName: string,
  providersSortedByPriority: string[]
): Result<boolean, Error> {
  if (document.profiles === undefined) {
    document.profiles = {};
  }
  if (document.profiles[profileName] === undefined) {
    return err(new Error(`Profile "${profileName}" does not exist`));
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
    return err(
      new Error(
        `Unable to set priority on profile "${profileName}" - profile providers not set`
      )
    );
  }

  if (providersSortedByPriority.some(p => profileProviders[p] === undefined)) {
    return err(
      new Error(
        `Unable to set priority on profile "${profileName}" - some of priority providers not set in profile providers property`
      )
    );
  }
  //check providers property
  const providers = document.providers;

  if (!providers) {
    return err(
      new Error(
        `Unable to set priority on profile "${profileName}" - providers not set`
      )
    );
  }

  if (providersSortedByPriority.some(p => providers[p] === undefined)) {
    return err(
      new Error(
        `Unable to set priority on profile "${profileName}" - some of priority providers not set in provider property`
      )
    );
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
    return err(
      new Error(
        `Unable to set priority on profile "${profileName}" - existing priority is same as new priority`
      )
    );
  }

  targetedProfile.priority = providersSortedByPriority;

  return ok(true);
}
