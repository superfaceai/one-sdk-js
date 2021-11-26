[Website](https://superface.ai) | [Get Started](https://superface.ai/docs/getting-started) | [Documentation](https://superface.ai/docs) | [Discord](https://sfc.is/discord) | [Twitter](https://twitter.com/superfaceai) | [Support](https://superface.ai/support)

<img src="https://github.com/superfaceai/one-sdk-js/raw/main/docs/LogoGreen.png" alt="Superface" width="100" height="100">

# Superface OneSDK

**Just one SDK for all the APIs you want to integrate with.**

[![GitHub Workflow Status](https://img.shields.io/github/workflow/status/superfaceai/one-sdk-js/CI)](https://github.com/superfaceai/one-sdk-js/actions/workflows/main.yml)
[![npm](https://img.shields.io/npm/v/@superfaceai/one-sdk)](https://www.npmjs.com/package/@superfaceai/one-sdk)
[![license](https://img.shields.io/npm/l/@superfaceai/one-sdk)](LICENSE)
![TypeScript](https://img.shields.io/static/v1?message=TypeScript&&logoColor=ffffff&color=007acc&labelColor=5c5c5c&label=built%20with)
[![Discord](https://img.shields.io/discord/819563244418105354?logo=discord&logoColor=fff)](https://sfc.is/discord)

OneSDK is a universal API client and core library of Superface. It provides a simple and uniform interface across many APIs and automatic runtime switching between API providers.

See [how Superface works](https://superface.ai/how-it-works) and [get started](https://superface.ai/docs/getting-started).

## Important Links

- [Superface website](https://superface.ai)
- [Get Started](https://superface.ai/docs/getting-started)
- [Documentation](https://superface.ai/docs)
- [Discord](https://sfc.is/discord)

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

💡 **For quick usage example, check [get started](https://superface.ai/docs/getting-started) documentation.**

OneSDK works with [Superface CLI](https://github.com/superfaceai/cli). First you install a profile for the use-case you want to use by executing this command in the project directory:

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
  const profile = await sdk.getProfile('<profileName>');

  const result = await profile.getUseCase('<usecaseName').perform({
    // Input parameters
  });

  console.log(result.unwrap());
}

run();
```

Optionally you can [define which provider should be used](https://superface.ai/docs/guides/using-multiple-providers).

Check the [Superface Catalog](https://superface.ai/catalog) for existing use-cases or learn how to [write your own use-cases](https://superface.ai/docs/guides/how-to-create).

<!-- TODO: point to docs for working with the result object -->

<!-- ## Documentation -->

## Support

If you have any questions, want to report a bug, request a feature or you just want to talk, feel free to [open an issue](https://github.com/superfaceai/one-sdk-js/issues/new/choose) or hop on our [Discord server](https://sfc.is/discord).

You can find more options for reaching us on the [Support page](https://superface.ai/support).

## Security

Superface doesn't act as a proxy and communicates with API providers directly; the secrets are sent only to the providers (see [how Superface works](https://superface.ai/how-it-works)).

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

The Superface SDK is licensed under the [MIT License](LICENSE).

© 2021 Superface s.r.o.

<!-- TODO: allcontributors -->
