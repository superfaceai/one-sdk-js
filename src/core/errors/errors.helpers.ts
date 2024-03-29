import type { SecurityValues } from '@superfaceai/ast';
import { AssertionError, BackoffKind } from '@superfaceai/ast';

import { SDKBindError, SDKExecutionError } from '../../lib';
import { isRegistryErrorBody } from '../registry';

export function superJsonNotDefinedError(
  callerName: string
): SDKExecutionError {
  return new SDKExecutionError(
    `Super.json must be defined to call "${callerName}"`,
    [],
    [
      'Define "superJson" property in SuperfaceClient constructor',
      'Add super.json config file with @superfaceai/cli package',
    ]
  );
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

export function unableToResolveProviderError(): SDKExecutionError {
  return new SDKExecutionError(
    'Unable to resolve provider',
    [
      'Provider must be specified in "perform" method call. Optionally, profileId and super.json can be used to obtain provider for profile.',
    ],
    [
      'Check that a provider is configured in "perform" call',
      'Optionally, check that a provider is configured for a profile in super.json',
      'Providers can be configured using the superface cli tool: `superface configure --help` for more info',
    ]
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
      'Check that a provider is configured for a profile in "perform" call',
      `Optionally, check that a provider is configured for a profile in super.json -> profiles["${profileId}"].providers`,
      'Providers can be configured using the superface cli tool: `superface configure --help` for more info',
    ]
  );
}

export function unsupportedFileExtensionError(
  filepath: string,
  correctExtension: string
): SDKExecutionError {
  return new SDKExecutionError(
    `File path ${filepath} contains unsupported extension.`,
    [],
    [`Use file with ${correctExtension} extension.`]
  );
}

export function sourceFileExtensionFoundError(
  extension: string
): SDKExecutionError {
  return new SDKExecutionError(
    `${extension} extension found.`,
    [],
    [`${extension} files need to be compiled with Superface CLI.`]
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

export function unableToResolveProfileError(
  profileId: string
): SDKExecutionError {
  return new SDKExecutionError(
    `Profile "${profileId}" not found in super.json or version is not defined in "getProfile"`,
    [
      `To resolve correct profile "${profileId}" must be defined in super.json or profile version must be specified in "getProfile" function`,
    ],
    [
      `Profile can be installed to local super.json using the superface cli tool: \`superface install ${profileId}\``,
      `Optionally full version eg. 1.0.0 can be passed to "getProfile" in format \`${profileId}@version\` or as an obejct: { id: ${profileId}, version: version}`,
    ]
  );
}

export function invalidIdentifierIdError(
  identifier: string,
  problematicPart: 'Name' | 'Scope'
): SDKExecutionError {
  return new SDKExecutionError(
    `${problematicPart} "${identifier}" is not a valid lowercase .`,
    [],
    ['Use valid idetifier']
  );
}

export function invalidVersionError(
  completeVersion: string,
  problematicPart: 'minor' | 'patch'
): SDKExecutionError {
  return new SDKExecutionError(
    `Version "${completeVersion}" is not valid version. "${problematicPart}" is missing or not a number`,
    [
      `Version "${completeVersion}" is not valid version in format major.minor.patch eg. "1.0.0". "${problematicPart}" is missing or not a number`,
    ],
    [
      'Pass valid version string in format major.minor.patch-label (-label is optional) eg. "1.0.0" or "1.2.3-test"',
    ]
  );
}

export function versionMismatchError(
  superJsonVersion: string,
  getProfileVersion: string
): SDKExecutionError {
  return new SDKExecutionError(
    `Version from super.json (${superJsonVersion}) and getProfile (${getProfileVersion}) does not match.`,
    ['If version in super.json and in "getProfile" is used they must match'],
    ['Use version either in super.json or in "getProfile"']
  );
}

export function variantMismatchError(
  astVariant: string | undefined,
  passedVariant: string | undefined
): SDKExecutionError {
  return new SDKExecutionError(
    `Variant from compiled map (${
      astVariant ?? 'undefined'
    }) and passed variant (${passedVariant ?? 'undefined'}) does not match.`,
    ['If variant in map and passed variant is used, they must match'],
    []
  );
}

export function profileNotFoundError(profileName: string): SDKExecutionError {
  return new SDKExecutionError(
    `Profile "${profileName}" not found in super.json`,
    [],
    []
  );
}

export function profileProviderNotFoundError(
  profileId: string,
  providerName: string
): SDKExecutionError {
  return new SDKExecutionError(
    `Provider "${providerName}" not found for profile "${profileId}" in super.json`,
    [],
    [
      `Optionally, check that a provider is configured for a profile in super.json -> profiles["${profileId}"].providers`,
      'Providers can be configured using the superface cli tool: `superface configure --help` for more info',
    ]
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
      'Providers can be configured using the superface cli tool: `superface configure --help` for more info',
    ]
  );
}

export function invalidProfileError(profileId: string): SDKExecutionError {
  return new SDKExecutionError(
    `Invalid profile "${profileId}"`,
    [],
    [
      'Check that the profile is installed in super.json -> profiles or that the url is valid',
      'Profiles can be installed using the superface cli tool: `superface install --help` for more info',
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
      'Check your super.json',
      `Check property "kind" in [profile].providers.[provider].defaults.[usecase].retryPolicy.backoff with value "${kind}"`,
      `Change value of property "kind" in retryPolicy.backoff to one of possible values: ${Object.values(
        BackoffKind
      ).join(', ')}`,
    ]
  );
}

export function invalidPathReplacementError(
  invalid: string[],
  url: string,
  all: string[],
  available: string[]
): SDKExecutionError {
  return new SDKExecutionError(
    `Missing or mistyped values for URL path replacement: ${invalid.join(
      ', '
    )}`,
    [
      `Trying to replace path keys for url: ${url}`,
      all.length > 0
        ? `Found these path keys: ${all.join(', ')}`
        : 'Found no path keys',
      available.length > 0
        ? `But only found these variables with supported types: ${available.join(
            ', '
          )}`
        : 'But found no variables with supported types',
    ],
    [
      'Make sure the url path variable refers to an available string, number or boolean variable',
      'Consider introducing a new variable with the correct name and desired value',
    ]
  );
}

export function missingSecurityValuesError(id: string): SDKExecutionError {
  return new SDKExecutionError(
    `Security values for security scheme not found: ${id}`,
    [
      `Security values for scheme "${id}" are required by the map`,
      'but they were not provided to the sdk',
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
      'Use local provider and profile provider (map)',
      'Use remote provider and profile provider (map)',
      'Use remote provider and local profile provider (map)',
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

export function profileIdsDoNotMatchError(
  mapProfileId: string,
  configProfileId: string
): SDKExecutionError {
  return new SDKExecutionError(
    `Profile id (${mapProfileId}) in map does not match profile id (${configProfileId}) in configuration`,
    [
      `Map file specifies profile id "${mapProfileId}".`,
      `Configuration specifies profile id "${configProfileId}".`,
    ],
    ['Pass profile id that matches to profile id in map or provide correct map']
  );
}

export function invalidHTTPMapValueType(
  kind: 'header' | 'query parameter',
  key: string,
  type: string
): SDKExecutionError {
  return new SDKExecutionError(
    `Invalid HTTP ${kind} value type: ${key}`,
    [`Value is of type ${type} but string was expected`],
    ['Stringify value before passing it to the HTTP request']
  );
}

export function digestHeaderNotFound(
  headerName: string,
  foundHeaders: string[]
): SDKExecutionError {
  return new SDKExecutionError(
    `Digest auth failed, unable to extract digest values from response. Header "${headerName}" not found in response headers.`,
    [`Found headers: ${foundHeaders.join(', ')}.`],
    [
      'Check API documentation if it specifies challenge header',
      'You can set challenge header in provider.json',
    ]
  );
}

export function missingPartOfDigestHeader(
  headerName: string,
  header: string,
  part: string
): SDKExecutionError {
  return new SDKExecutionError(
    `Digest auth failed, unable to extract digest values from response. Header "${headerName}" does not contain "${part}"`,
    [
      `Header: "${headerName}" with content: "${header}" does not contain part specifing: "${part}"`,
    ],
    []
  );
}

export function unexpectedDigestValue(
  valueName: string,
  value: string,
  possibleValues: string[]
): SDKExecutionError {
  return new SDKExecutionError(
    `Digest auth failed, parameter "${valueName}" has unexpected value: "${value}"`,
    [
      `Digest auth failed, parameter "${valueName}" has unexpected value: "${value}". Supported values: ${possibleValues.join(
        ', '
      )}`,
    ],
    []
  );
}

export function invalidResponseError(
  statusCode: number,
  error: unknown
): SDKExecutionError {
  if (isRegistryErrorBody(error)) {
    return new SDKBindError(
      `Registry call failed with status code: ${statusCode} and error message: ${error.title}`,
      error.detail !== undefined ? [error.detail] : [],
      []
    );
  }

  return new SDKBindError(
    `Registry call failed with unexpected error: ${JSON.stringify(error)}`,
    [],
    []
  );
}

// Bind errors
export function invalidProviderResponseError(error: unknown): SDKBindError {
  if (error instanceof AssertionError) {
    return new SDKBindError(
      'Bind call responded with invalid provider body',
      error.detailed().split('\n'),
      ['Received provider should be of type "ProviderJson"']
    );
  }

  return new SDKBindError(
    `Bind call response validation failed with unexpected error: ${JSON.stringify(
      error
    )}`,
    [],
    []
  );
}

export function invalidMapASTResponseError(): SDKBindError {
  return new SDKBindError(
    'Bind call response did not contain valid map',
    [],
    []
  );
}

export function bindResponseError({
  statusCode,
  profileId,
  provider,
  title,
  detail,
  mapVariant,
  mapRevision,
  apiUrl,
}: {
  statusCode: number;
  profileId: string;
  provider?: string;
  title?: string;
  detail?: string;
  mapVariant?: string;
  mapRevision?: string;
  apiUrl: string;
}): SDKBindError {
  const longLines = [];

  if (detail !== undefined) {
    longLines.push(detail);
  }

  if (mapVariant !== undefined) {
    longLines.push(`Looking for map variant "${mapVariant}"`);
  }

  if (mapRevision !== undefined) {
    longLines.push(`Looking for map revision "${mapRevision}"`);
  }

  return new SDKBindError(
    `Registry responded with status code ${statusCode}${
      title !== undefined ? ` - ${title}.` : '.'
    }`,
    longLines,
    [
      provider !== undefined
        ? `Check if profile "${profileId}" can be used with provider "${provider}"`
        : `Check if profile "${profileId}" can be used with selected provider.`,
      `If you are using remote profile you can check informations about profile at "${
        new URL(profileId, apiUrl).href
      }"`,
      `If you are trying to use remote profile check if profile "${profileId}" is published`,
      'If you are using local profile you can use local map and provider to bypass the binding',
    ]
  );
}

export function unknownBindResponseError({
  statusCode,
  profileId,
  body,
  provider,
  mapVariant,
  mapRevision,
  apiUrl,
}: {
  statusCode: number;
  profileId: string;
  body: unknown;
  provider?: string;
  mapVariant?: string;
  mapRevision?: string;
  apiUrl: string;
}): SDKBindError {
  const longLines = [
    provider !== undefined
      ? `Error occured when binding profile "${profileId}" with provider "${provider}"`
      : `Error occured when binding profile "${profileId}" with selected provider`,
  ];

  if (mapVariant !== undefined) {
    longLines.push(`Looking for map variant "${mapVariant}"`);
  }

  if (mapRevision !== undefined) {
    longLines.push(`Looking for map revision "${mapRevision}"`);
  }

  return new SDKBindError(
    `Registry responded with status code ${statusCode} and unexpected body ${String(
      body
    )}`,
    longLines,
    [
      provider !== undefined
        ? `Check if profile "${profileId}" can be used with provider "${provider}"`
        : `Check if profile "${profileId}" can be used with selected provider`,
      `If you are using remote profile you can check informations about profile at "${
        new URL(profileId, apiUrl).href
      }"`,
      `If you are trying to use remote profile check if profile "${profileId}" is published`,
      'If you are using local profile you can use local map and provider to bypass the binding',
    ]
  );
}

export function unknownProviderInfoError({
  message,
  provider,
  body,
  statusCode,
}: {
  message: string;
  provider: string;
  body: unknown;
  statusCode: number;
}): SDKExecutionError {
  const longLines = [
    message,
    `Error occured when fetching info about provider "${provider}"`,
  ];

  return new SDKExecutionError(
    `Registry responded with status code ${statusCode} and unexpected body ${String(
      body
    )}`,
    longLines,
    [`Check if provider "${provider}" is published`]
  );
}
