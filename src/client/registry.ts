import {
  assertMapDocumentNode,
  assertProviderJson,
  isProviderJson,
  MapDocumentNode,
  ProviderJson,
} from '@superfaceai/ast';

import { IConfig } from '../config';
import { UnexpectedError } from '../internal/errors';
import {
  bindResponseError,
  invalidProviderResponseError,
  unknownBindResponseError,
  unknownProviderInfoError,
} from '../internal/errors.helpers';
import { HttpClient, HttpResponse } from '../internal/interpreter/http';
import { CrossFetch } from '../lib/fetch';
import { ILogger } from '../lib/logger/logger';
import { ITimers } from '../lib/timers';

const DEBUG_NAMESPACE = 'registry';

export interface RegistryProviderInfo {
  url: string;
  registryId: string;
  serviceUrl: string;
  mappingUrl: string;
  semanticProfile: string;
}

export function assertIsRegistryProviderInfo(
  input: unknown,
  logger?: ILogger
): asserts input is { disco: RegistryProviderInfo[] } {
  function isRecord(
    inp: unknown
  ): inp is Record<keyof RegistryProviderInfo, unknown> {
    return typeof inp === 'object' && inp !== null;
  }

  function isDisco(inp: unknown): inp is { disco: unknown } {
    return isRecord(inp) && 'disco' in inp;
  }

  function isRegistryProviderInfo(
    inp: Record<keyof RegistryProviderInfo, unknown>
  ): inp is RegistryProviderInfo {
    return (
      isRecord(inp) &&
      'url' in inp &&
      'registryId' in inp &&
      'serviceUrl' in inp &&
      'mappingUrl' in inp &&
      'semanticProfile' in inp
    );
  }

  if (
    !isDisco(input) ||
    !Array.isArray(input.disco) ||
    !input.disco.every<RegistryProviderInfo>(isRegistryProviderInfo)
  ) {
    logger?.log(DEBUG_NAMESPACE, 'Invalid response from registry.');
    logger?.log(DEBUG_NAMESPACE, 'Received: %O', input);

    throw new UnexpectedError('Invalid response from registry');
  }
}

export async function fetchProviderInfo(
  providerName: string,
  config: IConfig,
  timers: ITimers,
  logger?: ILogger
): Promise<ProviderJson> {
  const fetchInstance = new CrossFetch(timers);
  const http = new HttpClient(fetchInstance, logger);
  const sdkToken = config.sdkAuthToken;

  logger?.log(
    DEBUG_NAMESPACE,
    `Fetching provider ${providerName} from registry`
  );
  const { body, statusCode } = await http.request(
    `/providers/${providerName}`,
    {
      method: 'GET',
      headers:
        sdkToken !== undefined
          ? [`Authorization: SUPERFACE-SDK-TOKEN ${sdkToken}`]
          : undefined,
      baseUrl: config.superfaceApiUrl,
      accept: 'application/json',
      contentType: 'application/json',
    }
  );

  function assertProperties(
    obj: unknown
  ): asserts obj is { definition: unknown } {
    if (
      typeof obj !== 'object' ||
      obj === null ||
      'definition' in obj === false
    ) {
      throw unknownProviderInfoError({
        message: 'Registry responded with invalid body',
        body: obj,
        provider: providerName,
        statusCode,
      });
    }
  }

  assertProperties(body);

  if (!isProviderJson(body.definition)) {
    throw unknownProviderInfoError({
      message: 'Registry responded with invalid ProviderJson definition',
      body: body.definition,
      provider: providerName,
      statusCode,
    });
  }

  return body.definition;
}

function parseBindResponse(
  request: {
    profileId: string;
    provider?: string;
    mapVariant?: string;
    mapRevision?: string;
    apiUrl: string;
  },
  response: HttpResponse
): {
  provider: ProviderJson;
  mapAst?: MapDocumentNode;
} {
  function isErrorBody(
    input: unknown
  ): input is { detail: string; title: string } {
    return (
      typeof input === 'object' &&
      input !== null &&
      'detail' in input &&
      'title' in input
    );
  }

  function assertProperties(
    obj: unknown
  ): asserts obj is { provider: unknown; map_ast: string } {
    if (
      typeof obj !== 'object' ||
      obj === null ||
      'provider' in obj === false ||
      'map_ast' in obj === false
    ) {
      throw unknownBindResponseError({
        ...request,
        statusCode: response.statusCode,
        body: response.body,
      });
    }
  }

  if (response.statusCode !== 200) {
    if (isErrorBody(response.body)) {
      throw bindResponseError({
        ...request,
        statusCode: response.statusCode,
        title: response.body.title,
        detail: response.body.detail,
      });
    }

    throw unknownBindResponseError({
      ...request,
      statusCode: response.statusCode,
      body: response.body,
    });
  }

  assertProperties(response.body);

  let mapAst: MapDocumentNode | undefined;
  try {
    mapAst = assertMapDocumentNode(JSON.parse(response.body.map_ast));
  } catch (error) {
    mapAst = undefined;
  }

  let provider;
  try {
    provider = assertProviderJson(response.body.provider);
  } catch (error) {
    throw invalidProviderResponseError(error);
  }

  return {
    provider,
    mapAst,
  };
}

export async function fetchBind(
  request: {
    profileId: string;
    provider?: string;
    mapVariant?: string;
    mapRevision?: string;
  },
  config: IConfig,
  timers: ITimers,
  logger?: ILogger
): Promise<{
  provider: ProviderJson;
  mapAst?: MapDocumentNode;
}> {
  const fetchInstance = new CrossFetch(timers);
  const http = new HttpClient(fetchInstance, logger);
  const sdkToken = config.sdkAuthToken;
  logger?.log(DEBUG_NAMESPACE, 'Binding SDK to registry');

  const fetchResponse = await http.request('/registry/bind', {
    method: 'POST',
    headers:
      sdkToken !== undefined
        ? [`Authorization: SUPERFACE-SDK-TOKEN ${sdkToken}`]
        : undefined,
    baseUrl: config.superfaceApiUrl,
    accept: 'application/json',
    contentType: 'application/json',
    body: {
      profile_id: request.profileId,
      provider: request.provider,
      map_variant: request.mapVariant,
      map_revision: request.mapRevision,
    },
  });

  return parseBindResponse(
    { ...request, apiUrl: config.superfaceApiUrl },
    fetchResponse
  );
}

export async function fetchMapSource(
  mapId: string,
  config: IConfig,
  timers: ITimers,
  logger?: ILogger
): Promise<string> {
  const fetchInstance = new CrossFetch(timers);
  const http = new HttpClient(fetchInstance, logger);
  const sdkToken = config.sdkAuthToken;
  logger?.log(DEBUG_NAMESPACE, `Getting source of map: "${mapId}"`);

  const { body } = await http.request(`/${mapId}`, {
    method: 'GET',
    headers:
      sdkToken !== undefined
        ? [`Authorization: SUPERFACE-SDK-TOKEN ${sdkToken}`]
        : undefined,
    baseUrl: config.superfaceApiUrl,
    accept: 'application/vnd.superface.map',
  });

  return body as string;
}
