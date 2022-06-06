import { HttpCallStatementNode, MapDocumentNode } from '@superfaceai/ast';

import { MapInterpreterExternalHandler } from '../../internal/interpreter/external-handler';
import { HttpResponse } from '../../internal/interpreter/http';
import { HTTPError } from '../../internal/interpreter/map-interpreter.errors';
import {
  eventInterceptor,
  Events,
  Interceptable,
  InterceptableMetadata,
} from '../../lib/events';

export class MapInterpreterEventAdapter
  implements Interceptable, MapInterpreterExternalHandler
{
  constructor(
    public readonly metadata?: InterceptableMetadata,
    public readonly events?: Events
  ) {}

  @eventInterceptor({
    eventName: 'unhandled-http',
    placement: 'before',
  })
  public async unhandledHttp(
    ast: MapDocumentNode | undefined,
    node: HttpCallStatementNode,
    response: HttpResponse
  ): Promise<'continue' | 'retry'> {
    if (response.statusCode >= 400) {
      throw new HTTPError(
        'HTTP Error',
        { node, ast },
        response.statusCode,
        response.debug.request,
        { body: response.body, headers: response.headers }
      );
    }

    return 'continue';
  }
}
