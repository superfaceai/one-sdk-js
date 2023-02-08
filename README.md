[Website](https://superface.ai) | [Get Started](https://superface.ai/docs/getting-started) | [Documentation](https://superface.ai/docs) | [Discord](https://sfc.is/discord) | [Twitter](https://twitter.com/superfaceai) | [Support](https://superface.ai/support)

<img src="https://github.com/superfaceai/one-sdk-js/raw/main/docs/LogoGreen.png" alt="Superface" width="100" height="100">

# Superface OneSDK

**One SDK for all the APIs you want to integrate with.**

[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/superfaceai/one-sdk-js/main.yml)](https://github.com/superfaceai/one-sdk-js/actions/workflows/main.yml)
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

## Usage

### First time use

💡 **For a quick usage example, check out [Get Started](https://superface.ai/docs/getting-started).**

Superface is all about use cases. You can start with one of the publically available use cases from the [Superface Catalog](https://superface.ai/catalog).

Once you've got your use case, you need to provide OneSDK with:
* profile name and version
* use case name
* provider name
* input parameters
* (if necessary) provider-specific integration parameters
* (if necessary) provider-specific security values

These can be found on the profile page (e.g. [vcs/user-repos](https://superface.ai/vcs/user-repos)). Security values need to be obtained through the relevant provider (e.g. on their website, in your account settings, by contacting them, etc.).

```js
const { SuperfaceClient } = require('@superfaceai/one-sdk');

const sdk = new SuperfaceClient();

async function run() {
  const profile = await sdk.getProfile({ id: '<profileName>', version: '<profileVersion>'});

  const result = await profile.getUseCase('<usecaseName>').perform({
    // Input parameters in format:
    '<key>': '<value>'
  },
  {
    provider: '<providerName>',
    parameters: {
      // Provider specific integration parameters in format:
      '<integrationParameterName>': '<integrationParameterValue>'
    },
    security: {
      // Provider specific security values in format:
      '<securityValueId>': {
        // Security values as described on profile page
      }
    }
  });

  console.log(result.unwrap());
}

run();
```

If you are missing a use case, [let us know](#support)! You can also always [add your own use-case or API provider](https://superface.ai/docs/guides/how-to-create).

### Advanced usage
As your project grows in size and complexity, you may find it useful to have a central location for configuring details concerning your API integrations. There are also some features that cannot be used with the simple approach described above, namely:
  - Using [locally stored profiles, maps and providers](https://superface.ai/docs/advanced-usage#local); e.g. (yet) unpublished integrations, or integrations with APIs internal to your organization. 
  - Configuring [provider failover](https://superface.ai/docs/guides/using-multiple-providers#failover).

For these cases, there's Superface configuration. 
To find out more, visit [Advanced Usage](https://superface.ai/docs/advanced-usage).

## Security

Superface is not a proxy. The calls are always going directly from your application to API providers. Their contents are **never** sent anywhere else but to the selected provider's API.

OneSDK accesses `superface/super.json` file if instructed to, and accesses cache in `node_modules/superface/.cache` directory. It also accesses local maps, profiles, and provider configuration as per configuration. Non-local maps, profiles and providers are loaded from the Superface remote registry at runtime, and cached locally. OneSDK also sends diagnostic usage report to Superface as described [below](#metrics-reporting).

More about how OneSDK handles secrets can be found in [SECURITY](SECURITY.md).

## Metrics Reporting

Superface allows you to [monitor your integrations](https://superface.ai/docs/guides/integrations-monitoring) and display the metrics on a dashboard. There are three kinds of metrics reported:

1. When an OneSDK instance is created
2. After each perform - reporting success or failure of a given use case
3. When provider failover is triggered - what provider failed and which one was switched to

These metrics contain no personal information nor the contents of the API calls and are rate limited as to not impact performance.

Utilizing this functionality requires you to obtain and set a `SUPERFACE_SDK_TOKEN`. For more information, see [Integrations Monitoring](https://superface.ai/docs/guides/integrations-monitoring).

However, even without an `SUPERFACE_SDK_TOKEN` set, this data is sent anonymized to Superface services for diagnostic purposes. All metrics reporting can be disabled by setting an environment variable:

```shell
SUPERFACE_DISABLE_METRIC_REPORTING=true
```

For metrics to be successfuly sent, the application needs to exit properly, i.e. there should be no unhandled `Promise` rejections or exceptions.

## Support

If you have any questions, want to report a bug, request a feature or you just want to talk, feel free to [open an issue](https://github.com/superfaceai/one-sdk-js/issues/new/choose) or hop on our [Discord server](https://sfc.is/discord).

You can find more options for reaching us on the [Support page](https://superface.ai/support).

## Public API

Only functions and APIs of entities below are a part of the public API, and can be safely relied upon not to break between semver-compatible releases.

Using other parts of this package is at your own risk.

* SuperfaceClient API
* Profile API
* UseCase API
* SuperJsonDocument Object
* Result API

Use of public APIs is described in the [reference](https://superface.ai/docs/reference/one-sdk).

## Contributing

We welcome all kinds of contributions! Please see the [Contribution Guide](CONTRIBUTING.md) to learn how to participate.

## License

OneSDK is licensed under the [MIT License](LICENSE).

© 2022 Superface s.r.o.

<!-- TODO: allcontributors -->
