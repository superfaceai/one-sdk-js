[Website](https://superface.ai) | [Get Started](https://superface.ai/docs/getting-started) | [Documentation](https://superface.ai/docs) | [Discord](https://sfc.is/discord) | [Twitter](https://twitter.com/superfaceai) | [Support](https://superface.ai/support)

<img src="https://github.com/superfaceai/one-sdk-js/raw/main/docs/LogoGreen.png" alt="Superface" width="100" height="100">

# Superface OneSDK

**Just one SDK for all the APIs you want to integrate with!**

[![GitHub Workflow Status](https://img.shields.io/github/workflow/status/superfaceai/one-sdk-js/CI)](https://github.com/superfaceai/one-sdk-js/actions/workflows/main.yml)
[![npm](https://img.shields.io/npm/v/@superfaceai/one-sdk)](https://www.npmjs.com/package/@superfaceai/one-sdk)
[![license](https://img.shields.io/npm/l/@superfaceai/one-sdk)](LICENSE)
![TypeScript](https://img.shields.io/static/v1?message=TypeScript&&logoColor=ffffff&color=007acc&labelColor=5c5c5c&label=built%20with)
[![Discord](https://img.shields.io/discord/819563244418105354?logo=discord&logoColor=fff)](https://sfc.is/discord)

OneSDK is a universal API client and core library of Superface. It provides a simple and uniform interface across many API providers and automatic runtime switching between providers.

See [how Superface works](https://superface.ai/how-it-works) and [get started](https://superface.ai/docs/getting-started).

## Install

Install the project into Node.js project with npm:

```shell
npm install @superfaceai/one-sdk
```

or Yarn:

```shell
yarn add @superfaceai/one-sdk
```

## Usage

💡 **For concrete usage example, check [get started](https://superface.ai/docs/getting-started) documentation.**

OneSDK works in tandem with [Superface CLI](https://github.com/superfaceai/cli). First you install a profile for the use-case you want to use by executing this command in the project directory:

```shell
npx @superfaceai/cli install <profileName>
```

Next you configure a provider for the use-case, optionally with API keys:

```shell
npx @superfaceai/cli configure <providerName> -p <profileName>
```

The CLI creates a configuration file in `superface/super.json` file which is loaded by OneSDK.

In your code, you initialize the SDK instance, load the profile and perform the use-case:

```js
const { SuperfaceClient } = require('@superfaceai/one-sdk');

const sdk = new SuperfaceClient();

async function run() {
  // Load the installed profile
  const profile = await sdk.getProfile('<profileName>');

  // Use the profile
  const result = await profile.getUseCase('<usecaseName').perform({
    // Input parameters
  });

  return result.unwrap();
}

run();
```

Check the [Superface Catalog](https://superface.ai/catalog) for existing use-cases or learn how to [write your own use-cases](https://superface.ai/docs/guides/how-to-create).

<!-- TODO: point to docs for working with the result object -->

<!-- ## Documentation -->

## Support

If you have any questions, want to report a bug, request a feature or you just want to talk, feel free to [open an issue](https://github.com/superfaceai/one-sdk-js/issues/new/choose) or hop on our [Discord server](https://sfc.is/discord).

You can find more options for reaching us on the [Support page](https://superface.ai/support).

## Security

Superface doesn't act as a proxy and communicates with API providers directly; the secrets are sent only to the providers (see [how Superface works](https://superface.ai/how-it-works)).

OneSDK accesses `superface/super.json` file and accesses cache in `superface/.cache` directory. It also accesses local maps, profiles, and provider configuration if specified in the `super.json` file. Non-local maps, profiles and provider configuration are loaded from the Superface network registry in the runtime and cached locally. OneSDK sends anonymized usage report to Superface as described [below](#metrics-reporting).

More about the journey of the secrets within OneSDK can be found in [Security](SECURITY.md).

### Metrics Reporting

## Contributing

## License

## Contributors

## Table of Contents

- [Background](#background)
- [Install](#install)
- [Usage](#usage)
- [Configuration](#configuration)
- [Metric reporting](#metric-reporting)
- [Security](#security)
- [Support](#support)
- [Maintainers](#maintainers)
- [Contributing](#contributing)
- [Licensing](#licensing)
- [License](#license)

## Background

Superface (super-interface) is a higher-order API, an abstraction on top of the modern APIs like GraphQL and REST. Superface is one interface to discover, connect, and query any capabilities available via conventional APIs.

Through its focus on application-level semantics, Superface decouples the clients from servers, enabling fully autonomous evolution. As such it minimizes the code base as well as errors and downtimes while providing unmatched resiliency and redundancy.

Superface allows for switching capability providers without development at a runtime in milliseconds. Furthermore, Superface decentralizes the composition and aggregation, and thus creates an Autonomous Integration Mesh.

Motivation behind Superface is nicely described in this [video](https://www.youtube.com/watch?v=BCvq3NXFb94) from APIdays conference.

You can get more information at https://superface.ai and https://superface.ai/docs.

## Install

To install the package, run in the project directory:

```
# npm users
npm install @superfaceai/one-sdk
# yarn users
yarn add @superfaceai/one-sdk
```

## Usage

### Using the OneSDK

To interact with Superface, initialize a new Superface OneSDK instance, references the profile and use case you're wanting to use, then perform it to get the result.

#### Initializing the OneSDK client

```typescript
import { SuperfaceClient } from '@superface/one-sdk';

const client = new SuperfaceClient();
```

#### Performing the use case

**Note**: You can change url of API requests by setting `SUPERFACE_API_URL` environment variable to desired base url.

Make sure a profile is installed by running `superface install <profileName>[@<profileVersion>]` in the project directory, then load the profile:

```typescript
const profile = await client.getProfile('<profileName>');
```

Next, make sure at least one provider is configured in super.json or select one manually. You can configure providers in super.json by running `superface configure <providerName>` and you can add additional or overriding configuration by calling `.configure` on the Provider object:

```typescript
const provider = await client.getProvider('<providerName>');
// provider.configure(...)
```

Then, obtain a use case and perform it with selected provider:

```typescript
const result = await profile.getUsecase('<usecaseName>').perform(
  {
    inputField: 1,
    anotherInputField: 'hello',
  },
  // optional, if provider is missing selects first configured provider from super.json
  { provider }
);
```

### Handling the results from `perform`

The `perform` method will take your inputs and additional information and perform the use case asynchronously. This method always returns a Result type that is either `Ok` or `Err`. This follows the [neverthrow](https://github.com/supermacro/neverthrow) approach. The SDK provides multiple ways to work with result.

#### Conditionals

You can use conditionals to check if the result was OK or if it errored. Use `isOk()` or `isErr()`to check type of result.

```typescript
if (result.isErr()) {
  // Result is error, error.toString() returns human readable description of what went wrong
  console.log(result.error.toString());
} else {
  // Result is ok and you can accees value here
  console.log(result.value);
}
```

#### Matching a value or error

The Result type also provides a `match` method to use functions to use the values or errors. The `match` method takes two functions, the first of which is for handling the `Ok` result and the the second for handling the `Err` result. The example above using `isOk` and `isErr` can be written using `match` like below.

```typescript
result.match(
  value => console.log(value),
  error => console.log(error.toString())
);
```

#### Unsafely unwrapping the result

Lastly, you can just use `unwrap`, which is less safe because it will throw an error.

```typescript
try {
  // Possible error is thrown here and it contains human readable description of what went wrong :)
  const value = result.unwrap();
  // You can accees value here
  console.log(value);
} catch (e) {
  console.log(e);
}
```

## Configuration

The Superface OneSDK is configurable through various environment variables:

- `SUPERFACE_SDK_TOKEN` - your auth token to integrate your running instance with Superface services
- `SUPERFACE_API_URL` - URL of the Superface services, you probably don't need to change this; default is https://superface.ai
- `SUPERFACE_PATH` - path to your super.json file; default is `./superface/super.json`
- `SUPERFACE_METRIC_DEBOUNCE_TIME_MIN` and `SUPERFACE_METRIC_DEBOUNCE_TIME_MAX` - to rate limit metric reporting, OneSDK will send aggregated metrics after at least `MIN` milliseconds and at most `MAX` milliseconds; default is 1000 for min and 60000 for max
- `SUPERFACE_DISABLE_METRIC_REPORTING` - set this variable to disable metric reporting; enabled by default

## Metric reporting

The Superface OneSDK will send info about usage to Superface services. This info is anonymized, rate limited and allows you to see how the client is performing on your dashboard. To be able to see those metrics, you need to provide your auth token.
There are three kinds of metrics reported at present - one is sent when the client instance is created, one after each perform (reporting success or failure) and one when a provider failover happens. The reports can be disabled or configured with [environment variables](#configuration).
For metrics to be successfuly sent, the application needs to be properly exited, i.e. there should be no unhandled Promise rejections or exceptions.

## Security

Superface is not man-in-the-middle so it does not require any access to secrets that are needed to communicate with provider API. Superface SDK only reads super.json file, resolved authorization secrets from environment variables or from the file itself and applies them to network requests as required by the specific map.

More about the journey of the secrets within SDK can be found in [Security](SECURITY.md).

## Support

If you need any additional support, have any questions or you just want to talk you can do that through our [documentation page](https://docs.superface.ai).

## Maintainers

- [@Lukáš Valenta](https://github.com/lukas-valenta)
- [@Edward](https://github.com/TheEdward162)
- [@Vratislav Kalenda](https://github.com/Vratislav)
- [@Z](https://github.com/zdne)

## Contributing

**Please open an issue first if you want to make larger changes**

Feel free to contribute! Please follow the [Contribution Guide](CONTRIBUTION_GUIDE.md).

## Licensing

<!-- TODO: move to Contributing -->

Licenses of `node_modules` are checked during push CI/CD for every commit. Only the following licenses are allowed:

- 0BDS
- MIT
- Apache-2.0
- ISC
- BSD-3-Clause
- BSD-2-Clause
- CC-BY-4.0
- CC-BY-3.0;BSD
- CC0-1.0
- Unlicense

## License

The Superface SDK is licensed under the [MIT](LICENSE).
© 2021 Superface
