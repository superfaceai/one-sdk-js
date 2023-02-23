import { SDKExecutionError } from '../../core';

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

export function invalidProfileProviderError(
  profileProviderSettings: string
): SDKExecutionError {
  return new SDKExecutionError(
    'Invalid profile provider entry format',
    [`Settings: ${profileProviderSettings}`],
    []
  );
}
