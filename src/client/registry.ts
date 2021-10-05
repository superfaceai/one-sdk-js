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

export async function fetchProviderInfo(
  providerName: string
): Promise<ProviderJson> {
  const fetchInstance = new CrossFetch();
  const http = new HttpClient(fetchInstance);
  const sdkToken = Config.instance().sdkAuthToken;

  registryDebug(`Fetching provider ${providerName} from registry`);
  const { body } = await http.request(`/providers/${providerName}`, {
    method: 'GET',
    headers: sdkToken
      ? [`Authorization: SUPERFACE-SDK-TOKEN ${sdkToken}`]
      : undefined,
    baseUrl: Config.instance().superfaceApiUrl,
    accept: 'application/json',
    contentType: 'application/json',
  });

  if (!isProviderJson(body)) {
    throw new UnexpectedError('Registry responded with invalid body');
  }

  return body;
}

// TODO: refine validator
const bindResponseValidator = zod.object({
  provider: zod.custom<ProviderJson>(data => isProviderJson(data)),
  map_ast: zod.string(),
});

export async function fetchBind(request: {
  profileId: string;
  provider?: string;
  mapVariant?: string;
  mapRevision?: string;
}): Promise<{
  provider: ProviderJson;
  mapAst: MapDocumentNode;
}> {
  const fetchInstance = new CrossFetch();
  const http = new HttpClient(fetchInstance);
  const sdkToken = Config.instance().sdkAuthToken;
  registryDebug('Binding SDK to registry');
  const { body } = await http.request('/registry/bind', {
    method: 'POST',
    headers: sdkToken
      ? [`Authorization: SUPERFACE-SDK-TOKEN ${sdkToken}`]
      : undefined,
    baseUrl: Config.instance().superfaceApiUrl,
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
    throw new UnexpectedError('Registry responded with invalid body');
  }

  return {
    provider: body.provider,
    // TODO: Validate
    mapAst: JSON.parse(body.map_ast) as MapDocumentNode,
  };
}
