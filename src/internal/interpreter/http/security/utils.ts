import { unsupportedContentType } from "../../../errors.helpers";
import { Variables, variablesToStrings } from "../../variables";
import { binaryBody, BINARY_CONTENT_REGEXP, BINARY_CONTENT_TYPES, FetchBody, formDataBody, FORMDATA_CONTENT, JSON_CONTENT, stringBody, URLENCODED_CONTENT, urlSearchParamsBody } from "../interfaces";


export function encodeBody(contentType: string | undefined, body: Variables, headers: Record<string, string>): { body: FetchBody, headers: Record<string, string> } {
  let finalHeaders = headers;
  let finalBody: FetchBody
  if (contentType === JSON_CONTENT) {
    finalHeaders['Content-Type'] ??= JSON_CONTENT;
    finalBody = stringBody(JSON.stringify(body));
  } else if (contentType === URLENCODED_CONTENT) {
    finalHeaders['Content-Type'] ??= URLENCODED_CONTENT;
    finalBody = urlSearchParamsBody(variablesToStrings(body));
  } else if (contentType === FORMDATA_CONTENT) {
    finalHeaders['Content-Type'] ??= FORMDATA_CONTENT;
    finalBody = formDataBody(variablesToStrings(body));
  } else if (
    contentType &&
    BINARY_CONTENT_REGEXP.test(contentType)
  ) {
    headers['Content-Type'] ??= contentType;
    let buffer: Buffer;
    if (Buffer.isBuffer(body)) {
      buffer = body;
    } else {
      //coerce to string then buffer
      buffer = Buffer.from(String(body));
    }
    finalBody = binaryBody(buffer);
  } else {
    const supportedTypes = [
      JSON_CONTENT,
      URLENCODED_CONTENT,
      FORMDATA_CONTENT,
      ...BINARY_CONTENT_TYPES,
    ];

    throw unsupportedContentType(contentType ?? '', supportedTypes);
  }

  return { body: finalBody, headers: finalHeaders }
}