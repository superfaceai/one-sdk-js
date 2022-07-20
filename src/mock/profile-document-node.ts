import { ProfileDocumentNode } from '@superfaceai/ast';

export const mockProfileDocumentNode = (options?: {
  name?: string;
  scope?: string;
  version?: {
    major: number;
    minor: number;
    patch: number;
    label?: string;
  };
  usecaseName?: string;
}): ProfileDocumentNode => ({
  kind: 'ProfileDocument',
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
  header: {
    kind: 'ProfileHeader',
    scope: options?.scope,
    name: options?.name ?? 'test',
    version: {
      major: options?.version?.major ?? 1,
      minor: options?.version?.minor ?? 0,
      patch: options?.version?.patch ?? 0,
      label: options?.version?.label,
    },
  },
  definitions: [
    {
      kind: 'UseCaseDefinition',
      useCaseName: options?.usecaseName ?? 'Test',
      safety: 'safe',
      result: {
        kind: 'UseCaseSlotDefinition',
        value: {
          kind: 'ObjectDefinition',
          fields: [
            {
              kind: 'FieldDefinition',
              fieldName: 'message',
              required: true,
              type: {
                kind: 'NonNullDefinition',
                type: {
                  kind: 'PrimitiveTypeName',
                  name: 'string',
                },
              },
            },
          ],
        },
      },
    },
  ],
});
