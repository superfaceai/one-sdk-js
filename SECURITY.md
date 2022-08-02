# Security within Superface OneSDK

OneSDK interprets the map to fulfill the required usecase. This often requires making HTTP requests with authorization. Thus the user needs to provide Superface with the right secrets to access the capability exposed by the API.

_Note: If any of the following links are out of date, please file an issue or open a PR and link to the relevant places again._

## The purpose of secrets

The only purpose of user secrets within superface is to authorize the user against the API. Superface does not use the secrets in any other way.

## Providing user secrets

Secrets can be provided to the SDK in the following ways:
* Environment variable described in super.json (recommended)
* Raw secret embedded in super.json
* Secrets passed directly by the calling code

## How the SDK transports secrets

Secrets are transported within SDK along multiple paths, eventually being merged into security configuration that is later used.

The main path of secrets into the SDK is by super.json. When the super.json file is loaded by the SDK (when a new SuperfaceClient instance is created for the first time, or manually) and [normalized](https://github.com/superfaceai/one-sdk-js/blob/master/src/internal/superjson.ts#L557), the environment variables are resolved.

The secrets are read from the normalized form of super.json either by the Provider API or by a more low-level ProfileProvider API, depending on the calling code. Both of these APIs also provide ways to directly pass secrets from the calling code.

The Provider API handles secrets when:
* [requesting a Provider](https://github.com/superfaceai/one-sdk-js/blob/master/src/client/public/client.ts#L65)
* [configuring a Provider](https://github.com/superfaceai/one-sdk-js/blob/master/src/client/public/provider.ts#L23)

Even when the calling code does not explicitly request a provider it is requested implicitly when performing a usecase.

The ProfileProvider API handles secrets inside the [bind](https://github.com/superfaceai/one-sdk-js/blob/master/src/client/query/profile-provider.ts#L161) method. This method [merges](https://github.com/superfaceai/one-sdk-js/blob/master/src/client/query/profile-provider.ts#L447) security configuration either from Provider API or from normalized super.json, and optionally from bind configuration with provider information. This creates SecurityConfiguration, which is passes into the MapInterpreter.

The MapInterpreter only [passes](https://github.com/superfaceai/one-sdk-js/blob/master/src/internal/interpreter/map-interpreter.ts#L282) the security configuration into the HttpClient.

## How the SDK uses secrets

HttpClient applies resolved secrets according to security requirements specified in the relevant map. These secrets are applied to the request body right before the request is executed.

The secrets are [found](https://github.com/superfaceai/one-sdk-js/blob/master/src/internal/http/http.ts#L202) based on security requirements. They are then [applied](https://github.com/superfaceai/one-sdk-js/blob/master/src/internal/http/http.ts#L219) using the [application functions](https://github.com/superfaceai/one-sdk-js/blob/master/src/internal/http/security.ts).

Once the request is executed no secrets are accessed until another request is to be prepared.

## Logging

Another aspect to consider is logging. Logging is **disabled** by default. When enabled, logging may leak user secrets, so an appropriate logging level should be selected to only expose as much information as is secure in given context.

To disable logging of secrets set the `DEBUG` variable to a pattern to match requested logging namespaces (as normal) and append the string `,-*:sensitive` to it (e.g. `DEBUG=*,-*:sensitive` to log everything but sensitive namespaces). More information about how logging works can be found in the description of the [debug package](https://www.npmjs.com/package/debug).
