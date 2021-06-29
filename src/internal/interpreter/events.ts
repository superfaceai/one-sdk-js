import { HttpCallStatementNode, MapDocumentNode } from '@superfaceai/ast';

import {
  eventInterceptor,
  Events,
  Interceptable,
  InterceptableMetadata,
} from '../../lib/events';
import { HttpResponse } from './http';
import { HTTPError } from './map-interpreter.errors';

export class MapInterpreterEventDispatcher implements Interceptable {
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
