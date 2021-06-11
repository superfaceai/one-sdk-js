import { isEmptyRecord } from '../interpreter/variables';
import {
  normalizeProfileSettings,
  normalizeUsecaseDefaults,
} from './normalize';
import {
  composeFileURI,
  isFileURIString,
  isVersionString,
  ProfileEntry,
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
  if (typeof targetedProfile === 'string') {
    defaults = payload.defaults;
  } else if (targetedProfile.defaults) {
    defaults = normalizeUsecaseDefaults(
      payload.defaults,
      normalizeUsecaseDefaults(targetedProfile.defaults)
    );
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
    document.profiles[profileName] = targetedProfile =
      normalizeProfileSettings(targetedProfile);

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
  let defaults: UsecaseDefaults | undefined;
  if (typeof profileProvider === 'string') {
    defaults = payload.defaults;
  } else if (profileProvider.defaults) {
    defaults = normalizeUsecaseDefaults(
      payload.defaults,
      normalizeUsecaseDefaults(profileProvider.defaults)
    );
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
