import { MapDocumentNode } from '@superfaceai/ast';
import createDebug from 'debug';
import * as zod from 'zod';

import { Config } from '../config';
import { isProviderJson, ProviderJson } from '../internal';
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

export async function fetchMapAST(url: string): Promise<MapDocumentNode> {
  const fetchInstance = new CrossFetch();
  const http = new HttpClient(fetchInstance);
  registryDebug('Fetching Map AST from registry');
  const { body } = await http.request(url, {
    method: 'GET',
    accept: 'application/json',
  });

  return body as MapDocumentNode;
}

export async function fetchProviders(
  profileId: string,
  registryUrl: string
): Promise<RegistryProviderInfo[]> {
  const fetchInstance = new CrossFetch();
  const http = new HttpClient(fetchInstance);
  registryDebug('Fetching providers from registry');
  const { body } = await http.request(registryUrl, {
    method: 'GET',
    queryParameters: {
      semanticProfile: profileId,
    },
    accept: 'application/json',
  });

  assertIsRegistryProviderInfo(body);

  return body.disco;
}

// TODO: refine validator
const bindResponseValidator = zod.object({
  provider: zod.custom<ProviderJson>(data => isProviderJson(data)),
  map_ast: zod.string(),
});

export async function fetchBind(
  request: {
    profileId: string;
    provider?: string;
    mapVariant?: string;
    mapRevision?: string;
  },
  options?: {
    registryUrl?: string;
  }
): Promise<{
  provider: ProviderJson;
  mapAst: MapDocumentNode;
}> {
  const fetchInstance = new CrossFetch();
  const http = new HttpClient(fetchInstance);
  const sdkToken = Config().sdkAuthToken;
  registryDebug('Binding SDK to registry');
  const { body } = await http.request('/registry/bind', {
    method: 'POST',
    headers: sdkToken
      ? [`Authorization: SUPERFACE-SDK-TOKEN ${sdkToken}`]
      : undefined,
    baseUrl: options?.registryUrl ?? Config().superfaceApiUrl,
    accept: 'application/json',
    contentType: 'application/json',
    body: {
      profile_id: request.profileId,
      provider: request.provider,
      map_variant: request.mapVariant,
      map_revision: request.mapRevision,
    },
  });
  if (!bindResponseValidator.check(body)) {
    throw new UnexpectedError('registry responded with invalid body');
  }

  return {
    provider: body.provider,
    // TODO: Validate
    mapAst: JSON.parse(body.map_ast) as MapDocumentNode,
  };
}
