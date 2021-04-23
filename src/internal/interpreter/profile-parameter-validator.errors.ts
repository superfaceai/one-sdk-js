import { ErrorBase } from '../errors';

export type ErrorContext = { path?: string[] };
export type ValidationError =
  | {
      kind: 'wrongInput' | 'enumValue';
      context?: ErrorContext;
    }
  | {
      kind: 'wrongType';
      context: ErrorContext & { expected: string; actual: string };
    }
  | { kind: 'notArray'; context: ErrorContext & { input: unknown } }
  | { kind: 'wrongUnion'; context: ErrorContext & { expected: string[] } }
  | {
      kind: 'elementsInArrayWrong';
      context: ErrorContext & { suberrors: ValidationError[] };
    }
  | {
      kind: 'missingRequired';
      context?: ErrorContext & { field: string };
    };

export function isWrongTypeError(
  err: ValidationError
): err is {
  kind: 'wrongType';
  context: { expected: string; actual: string };
} {
  return err.kind === 'wrongType';
}

export function addFieldToErrors(
  errors: ValidationError[],
  field: string
): ValidationError[] {
  return errors.map(err =>
    err.kind === 'missingRequired'
      ? { ...err, context: { ...err.context, field } }
      : err
  );
}

export function formatErrors(errors?: ValidationError[]): string {
  if (!errors) {
    return 'Unknown error';
  }

  return errors
    .map(err => {
      const prefix = err.context?.path
        ? `Path: ${err.context.path.join('.')}\nError: `
        : 'Error: ';
      switch (err.kind) {
        case 'wrongType':
          return `${prefix}Wrong type: expected ${err.context.expected}, but got ${err.context.actual}`;

        case 'notArray':
          return `${prefix}${JSON.stringify(
            err.context.input
          )} is not an array`;

        case 'missingRequired':
          return `${prefix}Missing required field`;

        case 'wrongUnion':
          return `${prefix}Result does not satisfy union: expected one of: ${err.context.expected.join(
            ', '
          )}`;

        case 'elementsInArrayWrong':
          return `${prefix}Some elements in array do not match criteria:\n${formatErrors(
            err.context.suberrors
          )}`;

        case 'enumValue':
          return `${prefix}Invalid enum value`;

        case 'wrongInput':
          return `Wrong input`;

        default:
          throw new Error('Invalid error!');
      }
    })
    .join('\n');
}

export class InputValidationError extends ErrorBase {
  constructor(public errors?: ValidationError[]) {
    super(
      'InputValidationError',
      'Input validation failed:' + '\n' + formatErrors(errors)
    );
  }

  public toString(): string {
    return this.message + '\n' + formatErrors(this.errors);
  }
}

export class ResultValidationError extends ErrorBase {
  constructor(public errors?: ValidationError[]) {
    super(
      'ResultValidationError',
      'Result validation failed:' + '\n' + formatErrors(errors)
    );
  }

  public toString(): string {
    return this.message + '\n' + formatErrors(this.errors);
  }
}

export const isInputValidationError = (
  err: unknown
): err is InputValidationError => {
  return err instanceof InputValidationError;
};

export const isResultValidationError = (
  err: unknown
): err is ResultValidationError => {
  return err instanceof ResultValidationError;
};

export type ProfileParameterError =
  | InputValidationError
  | ResultValidationError;
