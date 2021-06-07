import { MapDocumentNode } from '@superfaceai/ast';
import createDebug from 'debug';
import * as zod from 'zod';

import { isProviderJson, ProviderJson } from '../internal';
import { HttpClient } from '../lib/http';

const registryDebug = createDebug('superface:Registry');

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

export function getDefaultRegistryUrl(): string {
  const envUrl = process.env.SUPERFACE_API_URL;

  return envUrl ? new URL(envUrl).href : new URL('https://superface.ai').href;
}

// TODO: refine validator
const bindResponseValidator = zod.object({
  provider: zod.custom<ProviderJson>(data => isProviderJson(data)),
  map_ast: zod.string(),
});

export function loadSdkAuthToken(): string | undefined {
  const tokenEnvName = 'SUPERFACE_SDK_TOKEN';
  //Load superface token
  const loadedToken = process.env[tokenEnvName];
  if (!loadedToken) {
    registryDebug(`Environment variable ${tokenEnvName} not found`)

    return;
  }
  const token = loadedToken.trim();
  const tokenRegexp = /^(sfs)_([^_]+)_([0-9A-F]{8})/i;
  if (!tokenRegexp.test(token)) {
    registryDebug(`Value in environment variable ${tokenEnvName} is not valid SDK authentization token`)

    return;
  }

  return token;
}

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
  const sdkToken = loadSdkAuthToken();
  const { body } = await HttpClient.request('/registry/bind', {
    method: 'POST',
    headers: sdkToken
      ? [`Authorization: SUPERFACE-SDK-TOKEN ${sdkToken}`]
      : undefined,
    baseUrl: options?.registryUrl ?? getDefaultRegistryUrl(),
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
    throw new Error('registry responded with invalid body');
  }

  return {
    provider: body.provider,
    // TODO: Validate
    mapAst: JSON.parse(body.map_ast) as MapDocumentNode,
  };
}
