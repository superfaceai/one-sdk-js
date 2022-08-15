import type {
  AnonymizedSuperJsonDocument,
  NormalizedSuperJsonDocument,
} from '@superfaceai/ast';

import type { ICrypto } from '../../../interfaces';
import { configHash } from '../../../lib';

export function anonymizeSuperJson(
  document: NormalizedSuperJsonDocument
): AnonymizedSuperJsonDocument {
  const profiles: AnonymizedSuperJsonDocument['profiles'] = {};
  for (const [profile, profileEntry] of Object.entries(document.profiles)) {
    const providers: typeof profiles[string]['providers'] = [];
    for (const [provider, providerEntry] of Object.entries(
      profileEntry.providers
    )) {
      const anonymizedProvider: typeof providers[number] = {
        provider,
        version: 'unknown',
      };
      const providerPriority = profileEntry.priority.findIndex(
        providerName => provider === providerName
      );
      if (providerPriority > -1) {
        anonymizedProvider.priority = providerPriority;
      }
      if ('file' in providerEntry) {
        anonymizedProvider.version = 'file';
      } else if (
        'mapRevision' in providerEntry &&
        providerEntry.mapRevision !== undefined
      ) {
        anonymizedProvider.version = providerEntry.mapRevision;
        if (providerEntry.mapVariant !== undefined) {
          anonymizedProvider.version += `-${providerEntry.mapVariant}`;
        }
      }

      providers.push(anonymizedProvider);
    }
    profiles[profile] = {
      version: 'version' in profileEntry ? profileEntry.version : 'file',
      providers,
    };
  }

  return {
    profiles,
    providers: Object.keys(document.providers),
  };
}

export function hashSuperJson(
  document: NormalizedSuperJsonDocument,
  crypto: ICrypto
): string {
  // <profile>:<version>,<provider>:<priority>:[<version | file>],<provider>:<path>
  const anonymized = anonymizeSuperJson(document);
  const profileValues: string[] = [];
  for (const [profile, profileEntry] of Object.entries(anonymized.profiles)) {
    const providers: string[] = Object.entries(profileEntry.providers).map(
      ([provider, providerEntry]): string => {
        return [
          provider,
          providerEntry.priority,
          ...(providerEntry.version !== undefined
            ? [providerEntry.version]
            : []),
        ].join(':');
      }
    );
    // sort by provider name to be reproducible
    providers.sort();
    profileValues.push(
      [`${profile}:${profileEntry.version}`, ...providers].join(',')
    );
  }
  // sort by profile name to be reproducible
  profileValues.sort();

  // Copy and sort
  const providerValues = anonymized.providers.map(provider => provider).sort();

  return configHash([...profileValues, ...providerValues], crypto);
}
