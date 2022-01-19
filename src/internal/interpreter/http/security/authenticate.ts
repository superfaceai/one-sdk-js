import { HttpSecurityRequirement } from '@superfaceai/ast';
import { Events } from '../../../../lib/events';
import { AuthCache, SecurityConfiguration } from './interfaces';
import {
  AuthorizationCodeHandler,
  TempAuthorizationCodeConfiguration,
} from './oauth/authorization-code/authorization-code';

export function registerSecurityHooks(
  events: Events,
  cache: AuthCache,
  _securityConfiguration: SecurityConfiguration[],
  _securityRequirements?: HttpSecurityRequirement[]
): void {
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

  //TODO: REMOVE
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

  events.on('pre-request', { priority: 1 }, async (context, args) => {
    console.log('context', context, ' args', args);
    return handler.prepare(...args, cache);
  });

  events.on('post-request', { priority: 1 }, async (context, args) => {
    console.log('context affter', context, ' args', args);
    return handler.handle(
      context.previousResponse,
      context.resourceRequest,
      cache
    );
  });
}
