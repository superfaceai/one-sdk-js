import type { MapASTNode, MapDocumentNode } from '@superfaceai/ast';

import type {
  ErrorMetadata,
  IHTTPError,
  IJessieError,
  IMapASTError,
  IMappedError,
  IMappedHTTPError,
} from '../../interfaces';
import { ErrorBase } from '../../lib';

export class MapInterpreterErrorBase extends ErrorBase {
  private path?: string[];

  constructor(
    public override kind: string,
    public override message: string,
    public metadata?: ErrorMetadata
  ) {
    super(kind, message);
  }

  public get astPath(): string[] | undefined {
    if (this.path) {
      return this.path;
    }

    if (!this.metadata?.ast || !this.metadata?.node) {
      return undefined;
    }

    const dfs = (
      current: unknown,
      path: string[] = []
    ): string[] | undefined => {
      if (typeof current !== 'object' || current === null) {
        return undefined;
      }

      const newPath = (key: string) =>
        Array.isArray(current)
          ? [
              ...path.slice(0, path.length - 1),
              `${path[path.length - 1]}[${key}]`,
            ]
          : [...path, key];

      for (const [key, value] of Object.entries(current)) {
        if (value === this.metadata?.node) {
          return newPath(key);
        } else {
          if (typeof value === 'object') {
            const next = dfs(value, newPath(key));
            if (next !== undefined) {
              return next;
            }
          }
        }
      }

      return undefined;
    };

    this.path = dfs(this.metadata.ast);

    return this.path;
  }

  public override toString(): string {
    return [
      `${this.kind}: ${this.message}`,
      this.astPath ? `AST Path: ${this.astPath.join('.')}` : undefined,
      this.metadata?.node?.location
        ? `Original Map Location: Line ${this.metadata.node.location.start.line}, column ${this.metadata.node.location.start.column}`
        : undefined,
    ]
      .filter(line => line !== undefined && line !== '')
      .join('\n');
  }
}

export class MapASTError
  extends MapInterpreterErrorBase
  implements IMapASTError
{
  public name = 'MapASTError' as const;

  constructor(
    public override message: string,
    public override metadata?: ErrorMetadata
  ) {
    super('MapASTError', message, metadata);
  }
}

export class HTTPError extends MapInterpreterErrorBase implements IHTTPError {
  public name = 'HTTPError' as const;

  constructor(
    public override message: string,
    public override metadata?: ErrorMetadata,
    public statusCode?: number,
    public request?: {
      body?: unknown;
      headers?: Record<string, string>;
      url?: string;
    },
    public response?: {
      body?: unknown;
      headers?: Record<string, string>;
    }
  ) {
    super('HTTPError', message, metadata);
  }
}

export class MappedHTTPError<T>
  extends MapInterpreterErrorBase
  implements IMappedHTTPError<T>
{
  public name = 'MappedHTTPError' as const;

  constructor(
    public override message: string,
    public override metadata?: { node?: MapASTNode; ast?: MapDocumentNode },
    public statusCode?: number,
    public properties?: T
  ) {
    super('MappedHTTPError', message, metadata);
  }

  public override toString(): string {
    return [
      `${this.kind}: ${this.message}`,
      this.properties !== undefined
        ? 'Properties: ' + JSON.stringify(this.properties, undefined, 2)
        : undefined,
      this.astPath ? `AST Path: ${this.astPath.join('.')}` : undefined,
      this.metadata?.node?.location
        ? `Original Map Location: Line ${this.metadata.node.location.start.line}, column ${this.metadata.node.location.start.column}`
        : undefined,
    ]
      .filter(line => line !== undefined && line !== '')
      .join('\n');
  }
}

export class JessieError
  extends MapInterpreterErrorBase
  implements IJessieError
{
  public name = 'JessieError' as const;

  constructor(
    public override message: string,
    public originalError: Error,
    public override metadata?: { node?: MapASTNode; ast?: MapDocumentNode }
  ) {
    super('JessieError', message);
  }

  public override toString(): string {
    return [
      `${this.kind}: ${this.message}`,
      this.originalError.toString(),
      this.astPath ? `AST Path: ${this.astPath.join('.')}` : undefined,
      this.metadata?.node?.location
        ? `Original Map Location: Line ${this.metadata.node.location.start.line}, column ${this.metadata.node.location.start.column}`
        : undefined,
    ]
      .filter(line => line !== undefined && line !== '')
      .join('\n');
  }
}

export class MappedError<T>
  extends MapInterpreterErrorBase
  implements IMappedError<T>
{
  public name = 'MappedError' as const;

  constructor(
    public override message: string,
    public override metadata?: { node?: MapASTNode; ast?: MapDocumentNode },
    public properties?: T
  ) {
    super('MappedError', message, metadata);
  }

  public override toString(): string {
    return [
      `${this.kind}: ${this.message}`,
      this.properties !== undefined
        ? 'Properties: ' + JSON.stringify(this.properties, undefined, 2)
        : undefined,
      this.astPath ? `AST Path: ${this.astPath.join('.')}` : undefined,
      this.metadata?.node?.location
        ? `Original Map Location: Line ${this.metadata.node.location.start.line}, column ${this.metadata.node.location.start.column}`
        : undefined,
    ]
      .filter(line => Boolean(line))
      .join('\n');
  }
}
