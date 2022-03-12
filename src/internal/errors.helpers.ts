import { BackoffKind, SecurityValues } from '@superfaceai/ast';

import { SDKExecutionError } from './errors';

export function ensureErrorSubclass(error: unknown): Error {
  if (typeof error === 'string') {
    return new Error(error);
  } else if (error instanceof Error) {
    return error;
  }

  return new Error(JSON.stringify(error));
}

export function superJsonNotFoundError(
  path: string,
  error?: Error
): SDKExecutionError {
  const errorMessage = [`super.json not found in "${path}"`];
  if (error !== undefined) {
    errorMessage.push(error.toString());
  }

  return new SDKExecutionError('Unable to find super.json', errorMessage, []);
}

export function superJsonNotAFileError(path: string): SDKExecutionError {
  return new SDKExecutionError(
    'super.json is not a file',
    [`"${path}" is not a file`],
    []
  );
}

export function superJsonFormatError(error: Error): SDKExecutionError {
  return new SDKExecutionError(
    'super.json format is invalid',
    [error.toString()],
    []
  );
}

export function superJsonReadError(error: Error): SDKExecutionError {
  return new SDKExecutionError(
    'Unable to read super.json',
    [error.toString()],
    []
  );
}

export function noConfiguredProviderError(
  profileId: string
): SDKExecutionError {
  return new SDKExecutionError(
    `No configured provider found for profile: ${profileId}`,
    [
      `Profile "${profileId}" needs at least one configured provider for automatic provider selection`,
    ],
    [
      `Check that a provider is configured for a profile in super.json -> profiles["${profileId}"].providers`,
      `Providers can be configured using the superface cli tool: \`superface configure --help\` for more info`,
    ]
  );
}

export function profileNotInstalledError(profileId: string): SDKExecutionError {
  return new SDKExecutionError(
    `Profile not installed: ${profileId}`,
    [],
    [
      `Check that the profile is installed in super.json -> profiles["${profileId}"]`,
      `Profile can be installed using the superface cli tool: \`superface install ${profileId}\``,
    ]
  );
}

export function profileFileNotFoundError(
  file: string,
  profileId: string
): SDKExecutionError {
  return new SDKExecutionError(
    `Profile file at path does not exist: ${file}`,
    [
      `Profile "${profileId}" specifies a file path "${file}" in super.json`,
      'but this path does not exist or is not accessible',
    ],
    [
      `Check that path in super.json -> profiles["${profileId}"].file exists and is accessible`,
      'Paths in super.json are either absolute or relative to the location of super.json',
    ]
  );
}

export function profileNotFoundError(profileName: string): SDKExecutionError {
  return new SDKExecutionError(
    `Profile "${profileName}" not found in super.json`,
    [],
    []
  );
}

export function providersNotSetError(profileName: string): SDKExecutionError {
  return new SDKExecutionError(
    `Unable to set priority for "${profileName}"`,
    [`Providers not set for profile "${profileName}"`],
    [`Make sure profile ${profileName} has configured providers.`]
  );
}

export function unconfiguredProviderInPriorityError(
  profileId: string,
  priority: string[],
  providers: string[]
): SDKExecutionError {
  return new SDKExecutionError(
    `Priority array of profile: ${profileId} contains unconfigured provider`,
    [
      `Profile "${profileId}" specifies a provider array [${priority.join(
        ', '
      )}] in super.json`,
      `but there are only these providers configured [${providers.join(', ')}]`,
    ],
    [
      `Check that providers [${priority.join(
        ', '
      )}] are configured for profile "${profileId}"`,
      'Paths in super.json are either absolute or relative to the location of super.json',
    ]
  );
}

export function unconfiguredProviderError(
  providerName: string
): SDKExecutionError {
  return new SDKExecutionError(
    `Provider not configured: ${providerName}`,
    [`Provider "${providerName}" was not configured in super.json`],
    [
      `Providers can be configured using the superface cli tool: \`superface configure --help\` for more info`,
    ]
  );
}

export function invalidProfileError(profileId: string): SDKExecutionError {
  return new SDKExecutionError(
    `Invalid profile "${profileId}"`,
    [],
    [
      `Check that the profile is installed in super.json -> profiles or that the url is valid`,
      `Profiles can be installed using the superface cli tool: \`superface install --help\` for more info`,
    ]
  );
}

export function serviceNotFoundError(
  serviceId: string,
  providerName: string,
  defaultService: boolean
): SDKExecutionError {
  let hints: string[] = [];
  if (defaultService) {
    hints = [
      'This appears to be an error in the provider definition. Make sure that the defaultService in provider definition refers to an existing service id',
    ];
  }

  return new SDKExecutionError(
    `Service not found: ${serviceId}`,
    [`Service "${serviceId}" for provider "${providerName}" was not found`],
    hints
  );
}

export function securityNotFoundError(
  providerName: string,
  definedSchemes: string[],
  values: SecurityValues
): SDKExecutionError {
  return new SDKExecutionError(
    `Could not find security scheme for security value with id "${values.id}"`,
    [
      `The provider definition for "${providerName}" defines ` +
        (definedSchemes.length > 0
          ? `these security schemes: ${definedSchemes.join(', ')}`
          : 'no security schemes'),
      `but a secret value was provided for security scheme: ${values.id}`,
    ],
    [
      `Check that every entry id in super.json -> providers["${providerName}"].security refers to an existing security scheme`,
      `Make sure any configuration overrides in code for provider "${providerName}" refer to an existing security scheme`,
    ]
  );
}

export function invalidSecurityValuesError(
  providerName: string,
  type: string,
  id: string,
  valueKeys: string[],
  requiredKeys: string[]
): SDKExecutionError {
  return new SDKExecutionError(
    `Invalid security values for given ${type} scheme: ${id}`,
    [
      `The provided security values with id "${id}" have keys: ${valueKeys.join(
        ', '
      )}`,
      `but ${type} scheme requires: ${requiredKeys.join(', ')}`,
    ],
    [
      `Check that the entry with id "${id}" in super.json -> providers["${providerName}"].security refers to the correct security scheme`,
      `Make sure any configuration overrides in code for provider "${providerName}" refer to the correct security scheme`,
    ]
  );
}

export function invalidBackoffEntryError(kind: string): SDKExecutionError {
  return new SDKExecutionError(
    `Invalid backoff entry format: "${kind}"`,
    [
      `Property "kind" in retryPolicy.backoff object has unexpected value "${kind}"`,
      `Property "kind" in super.json [profile].providers.[provider].defaults.[usecase].retryPolicy.backoff with value "${kind}" is not valid`,
    ],
    [
      `Check your super.json`,
      `Check property "kind" in [profile].providers.[provider].defaults.[usecase].retryPolicy.backoff with value "${kind}"`,
      `Change value of property "kind" in retryPolicy.backoff to one of possible values: ${Object.values(
        BackoffKind
      ).join(', ')}`,
    ]
  );
}

export function missingPathReplacementError(
  missing: string[],
  url: string,
  all: string[],
  available: string[]
): SDKExecutionError {
  return new SDKExecutionError(
    `Missing values for URL path replacement: ${missing.join(', ')}`,
    [
      `Trying to replace path keys for url: ${url}`,
      all.length > 0
        ? `Found these path keys: ${all.join(', ')}`
        : 'Found no path keys',
      available.length > 0
        ? `But only found these potential variables: ${available.join(', ')}`
        : 'But found no potential variables',
    ],
    [
      'Make sure the url path variable refers to an available variable',
      'Consider introducing a new variable with the correct name and desired value',
    ]
  );
}

export function missingSecurityValuesError(id: string): SDKExecutionError {
  return new SDKExecutionError(
    `Security values for security scheme not found: ${id}`,
    [
      `Security values for scheme "${id}" are required by the map`,
      `but they were not provided to the sdk`,
    ],
    [
      `Make sure that the security scheme "${id}" exists in provider definition`,
      `Check that either super.json or provider configuration provides security values for the "${id}" security scheme`,
    ]
  );
}

export function apiKeyInBodyError(
  valueLocation: string,
  bodyType: string
): SDKExecutionError {
  return new SDKExecutionError(
    'ApiKey in body can be used only on object.',
    [`Actual ${valueLocation} is ${bodyType}`],
    []
  );
}

export function unsupportedContentType(
  contentType: string,
  supportedTypes: string[]
): SDKExecutionError {
  return new SDKExecutionError(
    `Content type not supported: ${contentType}`,
    [
      `Requested content type "${contentType}"`,
      `Supported content types: ${supportedTypes.join(', ')}`,
    ],
    []
  );
}

export function usecaseNotFoundError(
  name: string,
  usecases: string[]
): SDKExecutionError {
  return new SDKExecutionError(
    `Usecase not found: "${name}"`,
    [`Available usecases: ${usecases.join(', ')}`],
    []
  );
}

export function invalidProfileProviderError(
  profileProviderSettings: string
): SDKExecutionError {
  return new SDKExecutionError(
    'Invalid profile provider entry format',
    [`Settings: ${profileProviderSettings}`],
    []
  );
}

export function localProviderAndRemoteMapError(
  providerName: string,
  profileId: string
): SDKExecutionError {
  return new SDKExecutionError(
    `Unable to use local provider ${providerName} and remote profile provider (map)`,
    [
      `Super.json settings: ${profileId}.providers.${providerName}`,
      `Super.json settings providers.${providerName}`,
    ],
    [
      `Use local provider and profile provider (map)`,
      `Use remote provider and profile provider (map)`,
      `Use remote provider and local profile provider (map)`,
    ]
  );
}

export function referencedFileNotFoundError(
  fileName: string,
  extensions: string[]
): SDKExecutionError {
  return new SDKExecutionError(
    `File referenced in super.json not found: ${fileName}`,
    [
      'Tried to open files:',
      ...extensions.map(extension => `\t${fileName}${extension}`),
      'but none of them were found.',
    ],
    []
  );
}

export function providersDoNotMatchError(
  mapOrJsonProvider: string,
  configProvider: string,
  source: 'map' | 'provider.json'
): SDKExecutionError {
  return new SDKExecutionError(
    `Provider name in ${source} does not match provider name in configuration`,
    [
      `Map file specifies provider "${mapOrJsonProvider}".`,
      `Configuration specifies provider "${configProvider}".`,
    ],
    []
  );
}
