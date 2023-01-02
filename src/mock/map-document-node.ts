import type { MapDocumentNode } from '@superfaceai/ast';

export const mockMapDocumentNode = (options?: {
  name?: string;
  scope?: string;
  provider?: string;
  variant?: string;
  version?: {
    major: number;
    minor: number;
    patch: number;
    label?: string;
  };
  usecaseName?: string;
}): MapDocumentNode => {
  const ast: MapDocumentNode = {
    astMetadata: {
      sourceChecksum: 'checksum',
      astVersion: {
        major: 1,
        minor: 0,
        patch: 0,
      },
      parserVersion: {
        major: 1,
        minor: 0,
        patch: 0,
      },
    },
    kind: 'MapDocument',
    header: {
      kind: 'MapHeader',
      profile: {
        name: options?.name ?? 'test',
        scope: options?.scope ?? undefined,
        version: {
          major: options?.version?.major ?? 1,
          minor: options?.version?.minor ?? 0,
          patch: options?.version?.patch ?? 0,
          label: options?.version?.label ?? undefined,
        },
      },
      provider: options?.provider ?? 'test',
      variant: options?.variant ?? undefined,
    },
    definitions: [
      {
        kind: 'MapDefinition',
        name: options?.usecaseName ?? 'Test',
        usecaseName: options?.usecaseName ?? 'Test',
        statements: [],
      },
    ],
  };
  // Remove undefined properties
  if (ast.header.profile.scope === undefined) {
    delete ast.header.profile.scope;
  }

  if (ast.header.variant === undefined) {
    delete ast.header.variant;
  }

  if (ast.header.profile.version.label === undefined) {
    delete ast.header.profile.version.label;
  }

  return ast;
};
