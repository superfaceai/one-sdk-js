export interface InputParameterQueryConstraint<TValue> {
  mustAccept(val: TValue): InputConstraint<TValue>;
  mustAcceptOneOf(vals: TValue[]): InputConstraint<TValue>;
}

export interface OptionalParameterQueryConstraint<TValue>
  extends InputParameterQueryConstraint<TValue> {
  mustBeRespected(): InputConstraint<TValue>;
}

export interface InputConstraintBase {
  type: 'mustAccept' | 'mustAcceptOneOf' | 'mustBeRespected';
  name: string;
}

export interface InputConstraintAccept<T> extends InputConstraintBase {
  type: 'mustAccept';
  value: T;
}

export interface InputConstraintAcceptOne<T> extends InputConstraintBase {
  type: 'mustAcceptOneOf';
  value: T[];
}

export interface InputConstraintRespected extends InputConstraintBase {
  type: 'mustBeRespected';
}

export type InputConstraint<T = unknown> =
  | InputConstraintAccept<T>
  | InputConstraintAcceptOne<T>
  | InputConstraintRespected;

export const inputConstraintAccept = <T>(name: string) => (
  value: T
): InputConstraintAccept<T> => ({
  type: 'mustAccept',
  name,
  value,
});

export const inputConstraintAcceptOne = <T>(name: string) => (
  values: T[]
): InputConstraintAcceptOne<T> => ({
  type: 'mustAcceptOneOf',
  name,
  value: values,
});

export const inputConstraintRespected = (
  name: string
) => (): InputConstraintRespected => ({
  type: 'mustBeRespected',
  name,
});

export const inputQueryConstraint = <TValue>(
  name: string
): InputParameterQueryConstraint<TValue> => ({
  mustAccept: inputConstraintAccept(name),
  mustAcceptOneOf: inputConstraintAcceptOne(name),
});

export const optionalInputQueryConstraint = <TValue>(
  name: string
): OptionalParameterQueryConstraint<TValue> => ({
  ...inputQueryConstraint(name),
  mustBeRespected: inputConstraintRespected(name),
});

export type InputConstraintsObject<T> = {
  [key in keyof T]-?: undefined extends T[key]
    ? OptionalParameterQueryConstraint<NonNullable<T[key]>>
    : InputParameterQueryConstraint<T[key]>;
};

export interface ResultConstraintBase {
  type: 'mustBePresent';
  name: string;
}

export interface ResultConstraintPresent extends ResultConstraintBase {
  type: 'mustBePresent';
}

export type ResultConstraint = ResultConstraintPresent;

export interface ResultParameterQueryConstraint {
  mustBePresent(): ResultConstraint;
}

export const resultConstraintPresent = (
  name: string
) => (): ResultConstraintPresent => ({
  type: 'mustBePresent',
  name,
});

export const resultParameterConstraint = (
  name: string
): ResultParameterQueryConstraint => ({
  mustBePresent: resultConstraintPresent(name),
});

export type ResultConstraintsObject<T> = {
  [key in keyof T]-?: ResultParameterQueryConstraint;
};

export interface ServiceProviderConstraint {
  mustBeOneOf(providerIds: string[]): ServiceProviderConstraint;
  mustBe(providerId: string): ServiceProviderConstraint;
}

export interface ProviderConstraintBase {
  type: 'mustBe' | 'mustBeOneOf';
}

export interface ProviderConstraintMustBe extends ProviderConstraintBase {
  type: 'mustBe';
  value: string;
}

export interface ProviderConstraintMustBeOneOf extends ProviderConstraintBase {
  type: 'mustBeOneOf';
  values: string[];
}

export type ProviderConstraint =
  | ProviderConstraintMustBe
  | ProviderConstraintMustBeOneOf;

export function isProviderMustBeConstraint(
  constraint: ProviderConstraint
): constraint is ProviderConstraintMustBe {
  return constraint.type === 'mustBe';
}

export function isProviderMustBeOneOfConstraint(
  constraint: ProviderConstraint
): constraint is ProviderConstraintMustBeOneOf {
  return constraint.type === 'mustBeOneOf';
}

export interface ProviderQueryConstraint {
  mustBe(value: string): ProviderConstraint;
  mustBeOneOf(values: string[]): ProviderConstraint;
}

export const providerConstraintMustBe = (
  value: string
): ProviderConstraintMustBe => ({
  type: 'mustBe',
  value,
});

export const providerConstraintMustBeOneOf = (
  values: string[]
): ProviderConstraintMustBeOneOf => ({
  type: 'mustBeOneOf',
  values,
});

export const providerConstraint = {
  mustBe: providerConstraintMustBe,
  mustBeOneOf: providerConstraintMustBeOneOf,
};
