import {
  HttpScheme,
  HttpSecurityRequirement,
  SecurityType,
} from '@superfaceai/ast';
import { ApiKeyHandler, DigestHandler, HttpHandler, ISecurityHandler } from '.';
import { Events } from '../../../../lib/events';
import { missingSecurityValuesError } from '../../../errors.helpers';
import { AuthCache, SecurityConfiguration } from './interfaces';

import { OAuthHandler } from './oauth/oauth';

export function registerAuthenticationHooks(
  events: Events,
  cache: AuthCache,
  securityConfiguration: SecurityConfiguration[],
  securityRequirements?: HttpSecurityRequirement[]
): void {
  //Here we initialize security handler/s
  //TODO: think about how to get rid SecurityHandler class - easy for simple auth methods, harder for methods wneh we need to keep state
  let handler: ISecurityHandler;
  for (const requirement of securityRequirements ?? []) {
    const configuration = securityConfiguration.find(
      configuration => configuration.id === requirement.id
    );
    if (configuration === undefined) {
      throw missingSecurityValuesError(requirement.id);
    }
    if (configuration.type === SecurityType.APIKEY) {
      handler = new ApiKeyHandler(configuration);
    } else if (configuration.type === SecurityType.OAUTH) {
      handler = new OAuthHandler(configuration);
    } else if (configuration.scheme === HttpScheme.DIGEST) {
      handler = new DigestHandler(configuration);
    } else {
      handler = new HttpHandler(configuration);
    }
  }

  //Handle the events
  events.on('pre-request', { priority: 1 }, async (_context, args) => {
    return handler.prepare(...args, cache);
  });

  events.on('post-request', { priority: 1 }, async (context, _args) => {
    //TODO: handle can be undefined? Or it must be defined and we just continue in simple auth methods?
    return handler.handle(
      //TODO: what if response or request is undefined
      context.previousResponse!,
      context.resourceRequest!,
      cache
    );
  });
}
