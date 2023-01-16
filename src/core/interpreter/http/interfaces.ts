import type { IBinaryData } from '../../../interfaces';

type StringBody = { _type: 'string'; data: string };
type FormDataBody = { _type: 'formdata'; data: Record<string, unknown> };
type BinaryBody = { _type: 'binary'; data: Buffer | IBinaryData };
type URLSearchParamsBody = {
  _type: 'urlsearchparams';
  data: Record<string, string>;
};
export const stringBody = (data: string): StringBody => ({
  _type: 'string',
  data,
});
export const formDataBody = (data: Record<string, unknown>): FormDataBody => ({
  _type: 'formdata',
  data,
});
export const urlSearchParamsBody = (
  data: Record<string, string>
): URLSearchParamsBody => ({ _type: 'urlsearchparams', data });
export const binaryBody = (data: Buffer | IBinaryData): BinaryBody => ({
  _type: 'binary',
  data,
});
export function isStringBody(data: FetchBody): data is StringBody {
  return data._type === 'string';
}
export function isFormDataBody(data: FetchBody): data is FormDataBody {
  return data._type === 'formdata';
}
export function isUrlSearchParamsBody(
  data: FetchBody
): data is URLSearchParamsBody {
  return data._type === 'urlsearchparams';
}
export function isBinaryBody(data: FetchBody): data is BinaryBody {
  return data._type === 'binary';
}
export type FetchBody =
  | StringBody
  | FormDataBody
  | URLSearchParamsBody
  | BinaryBody;

export type HttpMultiMap = Record<string, string | string[]>;

export type FetchParameters = {
  headers?: HttpMultiMap;
  method: string;
  body?: FetchBody;
  queryParameters?: HttpMultiMap;
  timeout?: number;
};

export type FetchResponse = {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body?: unknown;
};

export type IFetch = {
  fetch(url: string, parameters: FetchParameters): Promise<FetchResponse>;
};

export const JSON_CONTENT = 'application/json';
export const JSON_PROBLEM_CONTENT = 'application/problem+json';
export const URLENCODED_CONTENT = 'application/x-www-form-urlencoded';
export const FORMDATA_CONTENT = 'multipart/form-data';
export const BINARY_CONTENT_TYPES = [
  'application/octet-stream',
  'video/*',
  'audio/*',
  'image/*',
];
export const BINARY_CONTENT_REGEXP =
  /application\/octet-stream|video\/.*|audio\/.*|image\/.*/;
