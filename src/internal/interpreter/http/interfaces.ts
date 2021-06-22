type StringBody = { _type: 'string'; data: string };
type FormDataBody = { _type: 'formdata'; data: Record<string, string> };
type URLSearchParamsBody = {
  _type: 'urlsearchparams';
  data: Record<string, string>;
};
export const stringBody = (data: string): StringBody => ({
  _type: 'string',
  data,
});
export const formDataBody = (data: Record<string, string>): FormDataBody => ({
  _type: 'formdata',
  data,
});
export const urlSearchParamsBody = (
  data: Record<string, string>
): URLSearchParamsBody => ({ _type: 'urlsearchparams', data });
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
export type FetchBody = StringBody | FormDataBody | URLSearchParamsBody;

export type FetchParameters = {
  headers?: Record<string, string | string[]>;
  method: string;
  body?: FetchBody;
  queryParameters?: Record<string, string>;
  timeout?: number
};

export type FetchResponse = {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body?: unknown;
};

export type FetchInstance = {
  fetch(url: string, parameters: FetchParameters): Promise<FetchResponse>;
};

export const JSON_CONTENT = 'application/json';
export const URLENCODED_CONTENT = 'application/x-www-form-urlencoded';
export const FORMDATA_CONTENT = 'multipart/form-data';
