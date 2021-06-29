import { HttpCallStatementNode, MapDocumentNode } from '@superfaceai/ast';

import { HttpResponse } from './http';

/**
 * Interface for external handler that is used in the MapInterpreter to handle certain states generically.
 */
export interface MapInterpreterExternalHandler {
  /** Invoked when the map interpreter http call finishes and no handler is defined in the map to handle such response. */
  unhandledHttp?(
    ast: MapDocumentNode | undefined,
    node: HttpCallStatementNode,
    response: HttpResponse
  ): Promise<void>;
}
