import type { MapDocumentNode } from '@superfaceai/ast';
import { HttpCallStatementNode } from '@superfaceai/ast';

import type { MapInterpreterExternalHandler } from '../../interpreter';
import { HTTPError, HttpResponse } from '../../interpreter';
import type { Events, Interceptable, InterceptableMetadata } from '../events';
import { eventInterceptor } from '../events';

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
