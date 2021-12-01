[Website](https://superface.ai) | [Get Started](https://superface.ai/docs/getting-started) | [Documentation](https://superface.ai/docs) | [Discord](https://sfc.is/discord) | [Twitter](https://twitter.com/superfaceai) | [Support](https://superface.ai/support)

<img src="https://github.com/superfaceai/one-sdk-js/raw/main/docs/LogoGreen.png" alt="Superface" width="100" height="100">

# Superface OneSDK

**One SDK for all the APIs you want to integrate with.**

[![GitHub Workflow Status](https://img.shields.io/github/workflow/status/superfaceai/one-sdk-js/CI)](https://github.com/superfaceai/one-sdk-js/actions/workflows/main.yml)
[![npm](https://img.shields.io/npm/v/@superfaceai/one-sdk)](https://www.npmjs.com/package/@superfaceai/one-sdk)
[![license](https://img.shields.io/npm/l/@superfaceai/one-sdk)](LICENSE)
![TypeScript](https://img.shields.io/static/v1?message=TypeScript&&logoColor=ffffff&color=007acc&labelColor=5c5c5c&label=built%20with)
[![Discord](https://img.shields.io/discord/819563244418105354?logo=discord&logoColor=fff)](https://sfc.is/discord)

OneSDK is a universal API client which provides an unparalleled developer experience for every HTTP API. It enhances resiliency to API changes and comes with built-in integration monitoring and fail-overs.

For more details about Superface visit [how it works](https://superface.ai/how-it-works) and [get started](https://superface.ai/docs/getting-started).

## Important Links

- [Superface website](https://superface.ai)
- [Get Started](https://superface.ai/docs/getting-started)
- [Documentation](https://superface.ai/docs)
- [Discord](https://sfc.is/discord)

## Install

To install OneSDK into a Node.js project run:

```shell
npm install @superfaceai/one-sdk
```

or Yarn:

```shell
yarn add @superfaceai/one-sdk
```

## Usage

💡 **For quick usage example, check [get started](https://superface.ai/docs/getting-started) documentation.**

With OneSDK everything revolves about your application's use cases for an API.
To get started, first install a use case profile using the [Superface CLI](https://github.com/superfaceai/cli). In the project directory, run:

```shell
npx @superfaceai/cli install <profileName>
```

The CLI creates a configuration file in `superface/super.json`.

Next you configure a provider for the use-case:

```shell
npx @superfaceai/cli configure <providerName> -p <profileName>
```

CLI may instruct you about setting up API keys if the provider needs them.

In your code, you initialize the SDK instance, load the profile and perform the use-case:

```js
const { SuperfaceClient } = require('@superfaceai/one-sdk');

const sdk = new SuperfaceClient();

async function run() {
  const profile = await sdk.getProfile('<profileName>');

  const result = await profile.getUseCase('<usecaseName>').perform({
    // Input parameters
  });

  console.log(result.unwrap());
}

run();
```

This code will use the first provider by priority as defined in `super.json` file. You can explicitly set the provider for `perform`:

```diff
 async function run() {
   const profile = await sdk.getProfile('<profileName>');

+  const provider = await sdk.getProvider('<providerName>');

   const result = await profile.getUseCase('<usecaseName>').perform(
     {
       // Input parameters
     },
+    { provider }
   );

   console.log(result.unwrap());
 }
```

To find available use-cases, sign up for Superface and visit [Use-cases Catalog](https://superface.ai/catalog). If you are missing a use case, [let us know](#support). You can always [add your own use-case or API provider](https://superface.ai/docs/guides/how-to-create).

<!-- TODO: point to docs for working with the result object -->

## Support

If you have any questions, want to report a bug, request a feature or you just want to talk, feel free to [open an issue](https://github.com/superfaceai/one-sdk-js/issues/new/choose) or hop on our [Discord server](https://sfc.is/discord).

You can find more options for reaching us on the [Support page](https://superface.ai/support).

## Security

Superface is not a proxy. The calls are always going directly from your application to API providers. The API secrets are never sent anywhere else but to the used provider's API.

OneSDK accesses `superface/super.json` file and accesses cache in `superface/.cache` directory. It also accesses local maps, profiles, and provider configuration if specified in the `super.json` file. Non-local maps, profiles and provider configuration are loaded from the Superface network registry in the runtime and cached locally. OneSDK sends diagnostic usage report to Superface as described [below](#metrics-reporting).

More about the journey of the secrets within OneSDK can be found in [Security](SECURITY.md).

## Metrics Reporting

OneSDK sends anonymized information about use-cases usage to Superface services. This info is anonymized, rate limited and allows you to [monitor your integrations](https://superface.ai/docs/integrations-monitoring) on the dashboard.

There are three kinds of metrics reported one is sent when the client instance is created, one after each perform (reporting success or failure), and one when a provider failover happens.

The reports can be disabled with environment variable:

```shell
SUPERFACE_DISABLE_METRIC_REPORTING=true
```

For metrics to be successfuly sent, the application needs to be properly exited, i.e. there should be no unhandled Promise rejections or exceptions.

## Contributing

We welcome all kinds of contributions! Please see the [Contribution Guide](CONTRIBUTING.md) to learn how to participate.

## License

OneSDK is licensed under the [MIT License](LICENSE).

© 2021 Superface s.r.o.

<!-- TODO: allcontributors -->
