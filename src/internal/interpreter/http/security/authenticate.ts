import { HttpSecurityRequirement } from '@superfaceai/ast';
import { Events } from '../../../../lib/events';
import { AuthCache, SecurityConfiguration } from './interfaces';
import {
  AuthorizationCodeHandler,
  TempAuthorizationCodeConfiguration,
} from './oauth/authorization-code/authorization-code';

export function registerAuthenticationHooks(
  events: Events,
  cache: AuthCache,
  _securityConfiguration: SecurityConfiguration[],
  _securityRequirements?: HttpSecurityRequirement[]
): void {
  //Here we initialize security hander/s
  //TODO: think about how to get rid SecurityHandler class - easy for simple auth methods, harder for methods wneh we need to keep state
  let handler: AuthorizationCodeHandler;
  // for (const requirement of securityRequirements ?? []) {
  //   const configuration = securityConfiguration.find(
  //     configuration => configuration.id === requirement.id
  //   );
  //   if (configuration === undefined) {
  //     throw missingSecurityValuesError(requirement.id);
  //   }

  //   if (configuration.type === SecurityType.APIKEY) {
  //     handler = new ApiKeyHandler(configuration);

  //   } else if (configuration.scheme === HttpScheme.DIGEST) {
  //     handler = new DigestHandler(configuration);
  //   } else {
  //     handler = new HttpHandler(configuration);
  //   }
  // }

  //TODO: REMOVE - this just for testing the OAuth
  //Test the oauth
  const config: TempAuthorizationCodeConfiguration = {
    clientId: process.env['GOOGLE_CLIENT_ID'] || '',
    clientSecret: process.env['GOOGLE_CLIENT_SECRET'] || '',
    tokenUrl: '/oauth2/v4/token',
    refreshToken: process.env['GOOGLE_CLIENT_REFRESH_TOKEN'] || '',
    scopes: [],
    authorizationUrl: '',
  };
  handler = new AuthorizationCodeHandler(config);

  //Handle the events
  events.on('pre-request', { priority: 1 }, async (context, args) => {
    console.log('context', context, ' args', args);
    return handler.prepare(...args, cache);
  });

  events.on('post-request', { priority: 1 }, async (context, args) => {
    console.log('context affter', context, ' args', args);
    //TODO: handle can be undefined? Or it must be defined and we just continue in simple auth methods?
    return handler.handle(
      context.previousResponse,
      context.resourceRequest,
      cache
    );
  });
}
