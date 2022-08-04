import { MapASTNode, MapDocumentNode } from '@superfaceai/ast';

import { ErrorBase } from '../errors';

export interface ErrorMetadata {
  node?: MapASTNode;
  ast?: MapDocumentNode;
}

export class MapInterpreterErrorBase extends ErrorBase {
  private path?: string[];

  constructor(kind: string, message: string, public metadata?: ErrorMetadata) {
    super(kind, message);
    Object.setPrototypeOf(this, MapInterpreterErrorBase.prototype);
  }

  public get astPath(): string[] | undefined {
    if (this.path) {
      return this.path;
    }

    if (!this.metadata?.ast || !this.metadata?.node) {
      return undefined;
    }

    const dfs = (
      current: MapASTNode,
      path: string[] = []
    ): string[] | undefined => {
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

export class MapASTError extends MapInterpreterErrorBase {
  constructor(message: string, public override metadata?: ErrorMetadata) {
    super(MapASTError.name, message, metadata);
    Object.setPrototypeOf(this, MapASTError.prototype);
  }
}

export class HTTPError extends MapInterpreterErrorBase {
  constructor(
    message: string,
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
    super(HTTPError.name, message, metadata);
    Object.setPrototypeOf(this, HTTPError.prototype);
  }
}

export class MappedHTTPError<T> extends HTTPError {
  constructor(
    message: string,
    public override statusCode?: number,
    public override metadata?: { node?: MapASTNode; ast?: MapDocumentNode },
    public properties?: T
  ) {
    super(message, metadata, statusCode);
    Object.setPrototypeOf(this, MappedHTTPError.prototype);
  }

  public override toString(): string {
    return [
      `${this.kind}: ${this.message}`,
      this.properties
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

export class JessieError extends MapInterpreterErrorBase {
  constructor(
    message: string,
    public originalError: Error,
    public override metadata?: { node?: MapASTNode; ast?: MapDocumentNode }
  ) {
    super(JessieError.name, message);
    Object.setPrototypeOf(this, JessieError.prototype);
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

export class MappedError<T> extends MapInterpreterErrorBase {
  constructor(
    message: string,
    public override metadata?: { node?: MapASTNode; ast?: MapDocumentNode },
    public properties?: T
  ) {
    super(MappedError.name, message, metadata);
    Object.setPrototypeOf(this, MappedError.prototype);
  }

  public override toString(): string {
    return [
      `${this.kind}: ${this.message}`,
      this.properties
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

export type MapInterpreterError =
  | MapASTError
  | MappedHTTPError<unknown>
  | MappedError<unknown>
  | HTTPError
  | JessieError;
