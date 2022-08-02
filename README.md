[Website](https://superface.ai) | [Get Started](https://superface.ai/docs/getting-started) | [Documentation](https://superface.ai/docs) | [Discord](https://sfc.is/discord) | [Twitter](https://twitter.com/superfaceai) | [Support](https://superface.ai/support)

<img src="https://github.com/superfaceai/one-sdk-js/raw/main/docs/LogoGreen.png" alt="Superface" width="100" height="100">

# Superface OneSDK

**One SDK for all the APIs you want to integrate with.**

[![GitHub Workflow Status](https://img.shields.io/github/workflow/status/superfaceai/one-sdk-js/CI)](https://github.com/superfaceai/one-sdk-js/actions/workflows/main.yml)
[![npm](https://img.shields.io/npm/v/@superfaceai/one-sdk)](https://www.npmjs.com/package/@superfaceai/one-sdk)
[![license](https://img.shields.io/npm/l/@superfaceai/one-sdk)](LICENSE)
![TypeScript](https://img.shields.io/static/v1?message=TypeScript&&logoColor=ffffff&color=007acc&labelColor=5c5c5c&label=built%20with)
[![Discord](https://img.shields.io/discord/819563244418105354?logo=discord&logoColor=fff)](https://sfc.is/discord)

OneSDK is a universal API client which provides an unparalleled developer experience for every HTTP API. It enhances resiliency to API changes, and comes with built-in integration monitoring and provider failover.

For more details about Superface, visit [How it Works](https://superface.ai/how-it-works) and [Get Started](https://superface.ai/docs/getting-started).

## Important Links

- [Superface website](https://superface.ai)
- [Get Started](https://superface.ai/docs/getting-started)
- [Documentation](https://superface.ai/docs)
- [Discord](https://sfc.is/discord)

## Install

To install OneSDK into a Node.js project, run:

```shell
npm install @superfaceai/one-sdk
```

or Yarn:

```shell
yarn add @superfaceai/one-sdk
```

## **Usage**

With OneSDK everything revolves about your application's use cases for an API.

<!-- TODO: some intro to  use case/profile? -->

OneSDK can be used in two ways:
* Without configuration, you pass most esential configuration directly in code. Ideal for trying out Superface and small projects.

* With configuration, you configure Superface with local config file or configuration object in code. Ideal when you need advanced features like provider failover or use of local capabilities.


<!-- TODO: do we still have get started? If yes, wil it be scoped to first time use or to use with super.json? -->
💡 **For quick usage example, check [get started](https://superface.ai/docs/getting-started) documentation.**

## First time use

You need to provide:
* profile name and version
* use-case name
* provider name
* input parameters
* provider specific integration parameters
* provider specific security values

These can be found on profile page. Values of security values can be found in your provider account.

```js
const { SuperfaceClient } = require('@superfaceai/one-sdk');

const sdk = new SuperfaceClient();

async function run() {
  const profile = await sdk.getProfile({ id: '<profileName>', version: '<profileVersion>'});

  const result = await profile.getUseCase('<usecaseName>').perform({
    // TODO: more detail description?
    // Input parameters
  },
  {
    provider: '<providerName>',
    parameters: {
      // Provider specific integration parameters in format:
      '<integrationParameterId>': '<integrationParameterValue>'
    },
    security: {
      // Provider specific security values in format:
      '<securityValueId>': {
        // Security value
      }
    }
  });

  console.log(result.unwrap());
}

run();
```


### Advanced use
<!-- TODO: some intro to super.json config file and super.json in code? -->
<!-- TODO: probably leave the in code super.json as a last option as it is difficult to configure-->
<!-- TODO: mention getProviderForProfile? -->

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

To find available use cases, visit the [Superface Catalog](https://superface.ai/catalog). If you are missing a use case, [let us know](#support)! You can also always [add your own use-case or API provider](https://superface.ai/docs/guides/how-to-create).

## Security

Superface is not a proxy. The calls are always going directly from your application to API providers. Their contents are **never** sent anywhere else but to the selected provider's API.

OneSDK accesses `superface/super.json` file if instructed to, and accesses cache in `superface/.cache` directory. It also accesses local maps, profiles, and provider configuration as per configuration. Non-local maps, profiles and providers are loaded from the Superface remote registry at runtime, and cached locally. OneSDK also sends diagnostic usage report to Superface as described [below](#metrics-reporting).

More about how OneSDK handles secrets can be found in [SECURITY](SECURITY.md).

## Metrics Reporting

Superface allows you to [monitor your integrations](https://superface.ai/docs/guides/integrations-monitoring) and display the metrics on a dashboard. There are three kinds of metrics reported:

1. When an OneSDK instance is created
2. After each perform (reporting success or failure of a given use case)
3. When a provider failover is triggered

This functionality requires you to obtain and set a `SUPERFACE_SDK_TOKEN`. For more information, see [Integrations Monitoring](https://superface.ai/docs/guides/integrations-monitoring).

OneSDK also sends anonymized metadata about its usage to Superface services. This data contains no personal information nor the contents of the API calls, is rate limited as to not impact performance, and can be disabled by setting an environment variable:

```shell
SUPERFACE_DISABLE_METRIC_REPORTING=true
```

For metrics to be successfuly sent, the application needs to exit properly, i.e. there should be no unhandled `Promise` rejections or exceptions.

## Support

If you have any questions, want to report a bug, request a feature or you just want to talk, feel free to [open an issue](https://github.com/superfaceai/one-sdk-js/issues/new/choose) or hop on our [Discord server](https://sfc.is/discord).

You can find more options for reaching us on the [Support page](https://superface.ai/support).

## Contributing

We welcome all kinds of contributions! Please see the [Contribution Guide](CONTRIBUTING.md) to learn how to participate.

## License

OneSDK is licensed under the [MIT License](LICENSE).

© 2022 Superface s.r.o.

<!-- TODO: allcontributors -->
