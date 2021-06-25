import { MapASTNode, MapDocumentNode } from '@superfaceai/ast';

import { ErrorBase } from '../errors';

export interface ErrorMetadata {
  node?: MapASTNode;
  ast?: MapDocumentNode;
}

export class MapInterpreterErrorBase extends ErrorBase {
  private path?: string[];

  constructor(
    public kind: string,
    public message: string,
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
}

export class MapASTError extends MapInterpreterErrorBase {
  constructor(public message: string, public metadata?: ErrorMetadata) {
    super('MapASTError', message, metadata);
  }

  public override toString(): string {
    return [
      `MapASTError: ${this.message}`,
      this.astPath ? `AST Path: ${this.astPath.join('.')}` : undefined,
      this.metadata?.node?.location
        ? `Original Map Location: Line ${this.metadata.node.location.line}, column ${this.metadata.node.location.column}`
        : undefined,
    ]
      .filter(line => !!line)
      .join('\n');
  }
}

export class HTTPError extends MapInterpreterErrorBase {
  constructor(
    public message: string,
    public metadata?: ErrorMetadata,
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

export class MappedHTTPError<T> extends HTTPError {
  constructor(
    public message: string,
    public statusCode?: number,
    public metadata?: { node?: MapASTNode; ast?: MapDocumentNode },
    public properties?: T
  ) {
    super(message, metadata, statusCode);
  }
}

export class JessieError extends MapInterpreterErrorBase {
  constructor(
    public message: string,
    public originalError: Error,
    public metadata?: { node?: MapASTNode; ast?: MapDocumentNode }
  ) {
    super('JessieError', message);
  }

  public override toString(): string {
    return [
      this.message,
      this.originalError.toString(),
      this.astPath ? `AST Path: ${this.astPath.join('.')}` : undefined,
      this.metadata?.node?.location
        ? `Original Map Location: Line ${this.metadata.node.location.line}, column ${this.metadata.node.location.column}`
        : undefined,
    ]
      .filter(line => !!line)
      .join('\n');
  }
}

export type MapInterpreterError = MapASTError | HTTPError | JessieError;
