import { MapDocumentNode } from '@superfaceai/ast';
import * as zod from 'zod';
import { isProviderJson, ProviderJson } from '../../internal';

import { HttpClient } from '../../internal/http';

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
    throw new Error('Invalid response from registry!');
  }
}

export async function fetchMapAST(url: string): Promise<MapDocumentNode> {
  const { body } = await HttpClient.request(url, {
    method: 'GET',
    accept: 'application/json',
  });

  return body as MapDocumentNode;
}

export async function fetchProviders(
  profileId: string,
  registryUrl: string
): Promise<RegistryProviderInfo[]> {
  const { body } = await HttpClient.request(registryUrl, {
    method: 'GET',
    queryParameters: {
      semanticProfile: profileId,
    },
    accept: 'application/json',
  });

  assertIsRegistryProviderInfo(body);

  return body.disco;
}

export const DEFAULT_REGISTRY_URL = 'https://superface.dev';

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
  const { body } = await HttpClient.request('/registry/bind', {
    method: 'POST',
    baseUrl: options?.registryUrl ?? DEFAULT_REGISTRY_URL,
    accept: 'application/json',
    contentType: 'application/json',
    headers: {
      'User-agent': 'superface sdk-js', // TODO: add version?
    },
    body: {
      profile_id: request.profileId,
      provider: request.provider,
      map_variant: request.mapVariant,
      map_revision: request.mapRevision,
    },
  });
  if (!bindResponseValidator.check(body)) {
    throw new Error('registry responded with invalid body');
  }

  return {
    provider: body.provider,
    // TODO: Validate
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    mapAst: JSON.parse(body.map_ast),
  };
}
