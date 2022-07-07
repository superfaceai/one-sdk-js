export interface IInputValidationError extends Error {
  name: 'InputValidationError';
}

export interface IResultValidationError extends Error {
  name: 'ResultValidationError';
}

export type ProfileParameterError =
  | IInputValidationError
  | IResultValidationError;
