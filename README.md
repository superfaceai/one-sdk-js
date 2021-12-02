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

## Contributors ✨

Thanks goes to these wonderful people ([emoji key](https://allcontributors.org/docs/en/emoji-key)):

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tr>
    <td align="center"><a href="https://github.com/TheEdward162"><img src="https://avatars.githubusercontent.com/u/10064857?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Edward</b></sub></a><br /><a href="https://github.com/superfaceai/one-sdk-js/commits?author=TheEdward162" title="Code">💻</a> <a href="#ideas-TheEdward162" title="Ideas, Planning, & Feedback">🤔</a> <a href="#infra-TheEdward162" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a> <a href="#maintenance-TheEdward162" title="Maintenance">🚧</a> <a href="#research-TheEdward162" title="Research">🔬</a> <a href="https://github.com/superfaceai/one-sdk-js/pulls?q=is%3Apr+reviewed-by%3ATheEdward162" title="Reviewed Pull Requests">👀</a></td>
    <td align="center"><a href="https://github.com/lukas-valenta"><img src="https://avatars.githubusercontent.com/u/13323507?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Lukáš Valenta</b></sub></a><br /><a href="https://github.com/superfaceai/one-sdk-js/commits?author=lukas-valenta" title="Code">💻</a> <a href="https://github.com/superfaceai/one-sdk-js/commits?author=lukas-valenta" title="Documentation">📖</a> <a href="#ideas-lukas-valenta" title="Ideas, Planning, & Feedback">🤔</a> <a href="#infra-lukas-valenta" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a> <a href="#maintenance-lukas-valenta" title="Maintenance">🚧</a> <a href="https://github.com/superfaceai/one-sdk-js/pulls?q=is%3Apr+reviewed-by%3Alukas-valenta" title="Reviewed Pull Requests">👀</a></td>
    <td align="center"><a href="https://github.com/Jakub-Vacek"><img src="https://avatars.githubusercontent.com/u/21127441?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Jakub Vacek</b></sub></a><br /><a href="https://github.com/superfaceai/one-sdk-js/commits?author=Jakub-Vacek" title="Code">💻</a> <a href="#ideas-Jakub-Vacek" title="Ideas, Planning, & Feedback">🤔</a> <a href="#infra-Jakub-Vacek" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a> <a href="#maintenance-Jakub-Vacek" title="Maintenance">🚧</a> <a href="#tool-Jakub-Vacek" title="Tools">🔧</a></td>
    <td align="center"><a href="https://github.com/martinalbert"><img src="https://avatars.githubusercontent.com/u/17796870?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Martin Albert</b></sub></a><br /><a href="https://github.com/superfaceai/one-sdk-js/commits?author=martinalbert" title="Code">💻</a> <a href="https://github.com/superfaceai/one-sdk-js/commits?author=martinalbert" title="Documentation">📖</a> <a href="#ideas-martinalbert" title="Ideas, Planning, & Feedback">🤔</a> <a href="#maintenance-martinalbert" title="Maintenance">🚧</a> <a href="https://github.com/superfaceai/one-sdk-js/commits?author=martinalbert" title="Tests">⚠️</a> <a href="#tool-martinalbert" title="Tools">🔧</a></td>
    <td align="center"><a href="https://github.com/janhalama"><img src="https://avatars.githubusercontent.com/u/5206165?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Jan Halama</b></sub></a><br /><a href="https://github.com/superfaceai/one-sdk-js/commits?author=janhalama" title="Code">💻</a> <a href="#ideas-janhalama" title="Ideas, Planning, & Feedback">🤔</a> <a href="#infra-janhalama" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a> <a href="#maintenance-janhalama" title="Maintenance">🚧</a></td>
    <td align="center"><a href="http://smizell.com/"><img src="https://avatars.githubusercontent.com/u/130959?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Stephen Mizell</b></sub></a><br /><a href="#blog-smizell" title="Blogposts">📝</a> <a href="https://github.com/superfaceai/one-sdk-js/commits?author=smizell" title="Code">💻</a> <a href="https://github.com/superfaceai/one-sdk-js/commits?author=smizell" title="Documentation">📖</a> <a href="#ideas-smizell" title="Ideas, Planning, & Feedback">🤔</a> <a href="#research-smizell" title="Research">🔬</a></td>
    <td align="center"><a href="https://www.ondrejmusil.cz/"><img src="https://avatars.githubusercontent.com/u/959390?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Ondrej Musil</b></sub></a><br /><a href="https://github.com/superfaceai/one-sdk-js/commits?author=freaz" title="Code">💻</a> <a href="https://github.com/superfaceai/one-sdk-js/commits?author=freaz" title="Documentation">📖</a> <a href="#ideas-freaz" title="Ideas, Planning, & Feedback">🤔</a> <a href="#infra-freaz" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a> <a href="#maintenance-freaz" title="Maintenance">🚧</a> <a href="#research-freaz" title="Research">🔬</a> <a href="https://github.com/superfaceai/one-sdk-js/pulls?q=is%3Apr+reviewed-by%3Afreaz" title="Reviewed Pull Requests">👀</a> <a href="https://github.com/superfaceai/one-sdk-js/commits?author=freaz" title="Tests">⚠️</a> <a href="#tutorial-freaz" title="Tutorials">✅</a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://github.com/zdne"><img src="https://avatars.githubusercontent.com/u/613617?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Z</b></sub></a><br /><a href="#blog-zdne" title="Blogposts">📝</a> <a href="#business-zdne" title="Business development">💼</a> <a href="https://github.com/superfaceai/one-sdk-js/commits?author=zdne" title="Code">💻</a> <a href="https://github.com/superfaceai/one-sdk-js/commits?author=zdne" title="Documentation">📖</a> <a href="#fundingFinding-zdne" title="Funding Finding">🔍</a> <a href="#ideas-zdne" title="Ideas, Planning, & Feedback">🤔</a> <a href="#projectManagement-zdne" title="Project Management">📆</a> <a href="#research-zdne" title="Research">🔬</a> <a href="https://github.com/superfaceai/one-sdk-js/pulls?q=is%3Apr+reviewed-by%3Azdne" title="Reviewed Pull Requests">👀</a> <a href="#talk-zdne" title="Talks">📢</a></td>
    <td align="center"><a href="http://www.applifting.cz/"><img src="https://avatars.githubusercontent.com/u/346066?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Vratislav Kalenda</b></sub></a><br /><a href="#business-Vratislav" title="Business development">💼</a> <a href="https://github.com/superfaceai/one-sdk-js/commits?author=Vratislav" title="Code">💻</a> <a href="#financial-Vratislav" title="Financial">💵</a> <a href="#ideas-Vratislav" title="Ideas, Planning, & Feedback">🤔</a> <a href="#research-Vratislav" title="Research">🔬</a></td>
    <td align="center"><a href="https://github.com/kysely"><img src="https://avatars.githubusercontent.com/u/23558634?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Radek Kyselý</b></sub></a><br /><a href="https://github.com/superfaceai/one-sdk-js/commits?author=kysely" title="Documentation">📖</a></td>
    <td align="center"><a href="https://jan.vlnas.cz/"><img src="https://avatars.githubusercontent.com/u/616767?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Jan Vlnas</b></sub></a><br /><a href="https://github.com/superfaceai/one-sdk-js/issues?q=author%3Ajnv" title="Bug reports">🐛</a> <a href="https://github.com/superfaceai/one-sdk-js/commits?author=jnv" title="Code">💻</a> <a href="#ideas-jnv" title="Ideas, Planning, & Feedback">🤔</a> <a href="#talk-jnv" title="Talks">📢</a></td>
  </tr>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification. Contributions of any kind welcome!
