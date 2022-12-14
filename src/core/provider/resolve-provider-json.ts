import type {
  NormalizedSuperJsonDocument,
  ProviderJson,
} from '@superfaceai/ast';
import { assertProviderJson } from '@superfaceai/ast';

import type { IConfig, IFileSystem, ILogger } from '../../interfaces';
import {
  providersDoNotMatchError,
  referencedFileNotFoundError,
  unconfiguredProviderError,
} from '../errors';

const DEBUG_NAMESPACE = 'provider-file-resolution';

export async function resolveProviderJson({
  providerName,
  superJson,
  fileSystem,
  logger,
  config,
}: {
  providerName: string;
  logger?: ILogger;
  superJson: NormalizedSuperJsonDocument | undefined;
  fileSystem: IFileSystem;
  config: IConfig;
}): Promise<ProviderJson | undefined> {
  if (superJson === undefined) {
    return undefined;
  }
  const providerSettings = superJson.providers[providerName];

  if (providerSettings === undefined) {
    throw unconfiguredProviderError(providerName);
  }

  if (providerSettings.file === undefined) {
    return undefined;
  }

  const log = logger?.log(DEBUG_NAMESPACE);
  const path = fileSystem.path.resolve(
    fileSystem.path.dirname(config.superfacePath),
    providerSettings.file
  );

  log?.(`Reading provider json from path: "${path}"`);
  const contents = await fileSystem.readFile(path);

  if (contents.isErr()) {
    throw referencedFileNotFoundError(path, []);
  }

  const providerJson = assertProviderJson(JSON.parse(contents.value));
  // check if provider name match
  if (providerName !== providerJson.name) {
    throw providersDoNotMatchError(
      providerJson.name,
      providerName,
      'provider.json'
    );
  }

  return providerJson;
}
