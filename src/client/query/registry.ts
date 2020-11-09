import { MapDocumentNode } from '@superfaceai/language';

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
