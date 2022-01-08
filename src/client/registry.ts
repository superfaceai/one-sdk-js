import {
  assertMapDocumentNode,
  assertProviderJson,
  isProviderJson,
  MapDocumentNode,
  ProviderJson,
} from '@superfaceai/ast';
import createDebug from 'debug';

import { Config } from '../config';
import { UnexpectedError } from '../internal/errors';
import { HttpClient } from '../internal/interpreter/http';
import { CrossFetch } from '../lib/fetch';

const registryDebug = createDebug('superface:registry');

export interface RegistryProviderInfo {
  url: string;
  registryId: string;
  serviceUrl: string;
  mappingUrl: string;
  semanticProfile: string;
}

export function assertIsRegistryProviderInfo(
  input: unknown
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
    registryDebug('Invalid response from registry.');
    registryDebug(`Received: ${JSON.stringify(input, undefined, 2)}`);
    throw new UnexpectedError('Invalid response from registry');
  }
}

export async function fetchProviderInfo(
  providerName: string,
  config: Config
): Promise<ProviderJson> {
  const fetchInstance = new CrossFetch();
  const http = new HttpClient(fetchInstance);
  const sdkToken = config.sdkAuthToken;

  registryDebug(`Fetching provider ${providerName} from registry`);
  const { body } = await http.request(`/providers/${providerName}`, {
    method: 'GET',
    headers: sdkToken
      ? [`Authorization: SUPERFACE-SDK-TOKEN ${sdkToken}`]
      : undefined,
    baseUrl: config.superfaceApiUrl,
    accept: 'application/json',
    contentType: 'application/json',
  });

  function assertProperties(
    obj: unknown
  ): asserts obj is { definition: unknown } {
    if (
      typeof obj !== 'object' ||
      obj === null ||
      'definition' in obj === false
    ) {
      throw new UnexpectedError('Registry responded with invalid body');
    }
  }

  assertProperties(body);

  if (!isProviderJson(body.definition)) {
    throw new UnexpectedError('Registry responded with invalid body');
  }

  return body.definition;
}

function parseBindResponse(input: unknown): {
  provider: ProviderJson;
  mapAst?: MapDocumentNode;
} {
  function assertProperties(
    obj: unknown
  ): asserts obj is { provider: unknown; map_ast: string } {
    if (
      typeof obj !== 'object' ||
      obj === null ||
      'provider' in obj === false ||
      'map_ast' in obj === false
    ) {
      throw new UnexpectedError('Registry responded with invalid body');
    }
  }

  assertProperties(input);

  let mapAst: MapDocumentNode | undefined;
  try {
    mapAst = assertMapDocumentNode(JSON.parse(input.map_ast));
  } catch (error) {
    mapAst = undefined;
  }

  return {
    provider: assertProviderJson(input.provider),
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
  config: Config
): Promise<{
  provider: ProviderJson;
  mapAst?: MapDocumentNode;
}> {
  const fetchInstance = new CrossFetch();
  const http = new HttpClient(fetchInstance);
  const sdkToken = config.sdkAuthToken;
  registryDebug('Binding SDK to registry');
  const { body } = await http.request('/registry/bind', {
    method: 'POST',
    headers: sdkToken
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

  return parseBindResponse(body);
}

export async function fetchMapSource(
  mapId: string,
  config: Config
): Promise<string> {
  const fetchInstance = new CrossFetch();
  const http = new HttpClient(fetchInstance);
  const sdkToken = config.sdkAuthToken;
  registryDebug(`Getting source of map: "${mapId}"`);

  const { body } = await http.request(`/${mapId}`, {
    method: 'GET',
    headers: sdkToken
      ? [`Authorization: SUPERFACE-SDK-TOKEN ${sdkToken}`]
      : undefined,
    baseUrl: config.superfaceApiUrl,
    accept: 'application/vnd.superface.map',
  });

  return body as string;
}
