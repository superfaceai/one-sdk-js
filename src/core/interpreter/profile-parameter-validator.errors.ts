import { ErrorBase, UnexpectedError } from '../errors';

export type ErrorContext = { path?: string[] };
export type ValidationError =
  | {
      kind: 'wrongInput';
      context?: ErrorContext;
    }
  | {
      kind: 'enumValue';
      context?: ErrorContext & { actual: string };
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
    }
  | {
      kind: 'nullInNonNullable';
      context?: ErrorContext & { field: string };
    };

export function isWrongTypeError(err: ValidationError): err is {
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
        ? `  Field '${err.context.path.join('.')}'`
        : '  Unknown field';
      switch (err.kind) {
        case 'wrongType':
          return `${prefix} has wrong type, expected '${err.context.expected}', actual '${err.context.actual}'`;

        case 'notArray':
          return `${prefix} ${JSON.stringify(
            err.context.input
          )} is not an array`;

        case 'missingRequired':
          return `${prefix} is missing`;

        case 'wrongUnion':
          return `${prefix} does not satisfy union, expected one of: ${err.context.expected.join(
            ', '
          )}`;

        case 'elementsInArrayWrong':
          return `${prefix} some elements in array do not match criteria:\n${formatErrors(
            err.context.suberrors
          )}`;

        case 'enumValue':
          return (
            `${prefix} has invalid enum value` +
            (err.context !== undefined ? ` ${err.context?.actual}` : '')
          );

        case 'nullInNonNullable':
          return `${prefix} is non-nullable`;

        case 'wrongInput':
          return 'has wrong input';

        default:
          throw new UnexpectedError('Invalid error!');
      }
    })
    .join('\n');
}

export class ProfileParameterError extends ErrorBase {}

export class InputValidationError extends ProfileParameterError {
  constructor(public errors?: ValidationError[]) {
    super(InputValidationError.name, '\n' + formatErrors(errors));
  }
}

export class ResultValidationError extends ProfileParameterError {
  constructor(public errors?: ValidationError[]) {
    super(ResultValidationError.name, '\n' + formatErrors(errors));
  }
}
