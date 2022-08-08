import type { MapInterpreterError } from './map-interpreter.errors';
import type { ProfileParameterError } from './profile-parameter-validator.errors';

// TODO
export type PerformError = ProfileParameterError | MapInterpreterError;
