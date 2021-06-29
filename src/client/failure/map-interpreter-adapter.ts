import { HttpCallStatementNode, MapDocumentNode } from '@superfaceai/ast';

import { HTTPError } from '../..';
import { MapInterpreterExternalHandler } from '../../internal/interpreter/external-handler';
import { HttpResponse } from '../../internal/interpreter/http';
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
  async unhandledHttp(
    ast: MapDocumentNode | undefined,
    node: HttpCallStatementNode,
    response: HttpResponse
  ): Promise<void> {
    if (response.statusCode >= 400) {
      throw new HTTPError(
        'HTTP Error',
        { node, ast },
        response.statusCode,
        response.debug.request,
        { body: response.body, headers: response.headers }
      );
    }
  }
}
