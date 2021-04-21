# Superface One SDK _(one-sdk-js)_

![superface logo](https://github.com/superfaceai/one-sdk-js/blob/master/docs/LogoGreen.svg)

Superface is the core SDK of the Superface project. It is the library that communicates with registry and performs operations on profiles/maps, including input/output validations.

TODO: Fill out this long description.

## Table of Contents

- [Background](#background)
- [Install](#install)
- [Publish](#publish)
- [Usage](#usage)
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

You can get more information at https://superface.ai and https://developer.superface.dev.

## Install

To install the package, log in with npm into the github registry using Github Person Token with at least the `repo` and `read:packages` permissions:

```
npm login --scope=@superfaceai --registry=https://npm.pkg.github.com
```

Then run in the project directory:

```
# npm users
npm install @superfaceai/sdk
# yarn users
yarn add @superfaceai/sdk
```

## Publish

Package publishing is done through GitHub release functionality.

[Draft a new release](https://github.com/superfaceai/one-sdk-js/releases/new) to publish a new version of the package.

Use semver for the version tag. It must be in format of `v<major>.<minor>.<patch>`.

Github Actions workflow will pick up the release and publish it as one of the [packages](https://github.com/superfaceai/one-sdk-js/packages).

## Usage

### Untyped

To interact with superface create a new superface client instance:

```typescript
const client = new SuperfaceClient()
```

Make sure a profile is installed by running `superface install <profileName>[@<profileVersion>]` in the project directory, then load the profile:

```typescript
const profile = await client.getProfile('<profileName>')
```

Next, make sure at least one provider is configured in super.json or select one manually. You can configure providers in super.json by running `superface configure <providerName>` and you can add additional or overriding configuration by calling `.configure` on the Provider object:

```typescript
const provider = await client.gerProvider('<providerName>')
// provider.configure(...)
```

Lastly, obtain a usecase and perform it with selected provider:

```typescript
const result = await profile.getUsecase('<usecaseName>').perform(
  {
    inputField: 1,
    anotherInputField: 'hello'
  },
  { provider } // optional, if missing selects first configured provider from super.json
)
```

### [WIP] ServiceFinderQuery

To perform a usecase by fetching ASTs from registry, use `ServiceFinderQuery`:

```typescript
const serviceFinder = new ServiceFinderQuery<any, any>(profileId, profileAST, usecase, registryUrl);
```

Where `profileId` is the id of profile, `profileAST` is the compiled AST of profile, `usecase` is the name of usecase to perform and `registryUrl` is the URL of the registry to use, defaults to `https://registry.superface.dev/api/registry` now.

With `serviceFinder`, you can filter providers by id:

```typescript
serviceFinder.serviceProvider(service => service.mustBe(providerId));
```

or

```typescript
serviceFinder.serviceProvider(service => service.mustBeOneOf([providerId1, providerId2]));
```

where `providerId` is the string uniquely representing a provider.

You can then get first or all available providers:

```typescript
const provider = await serviceFinder.serviceProvider(service => service.mustBe(providerId)).findFirst();
const providers = await serviceFinder.serviceProvider(service => service.mustBeOnOf([providerId1, providerId2])).find();
```

### [WIP] Performing the usecase

To fetch Map and be able to perform your usecase, the Provider must be bound:

```typescript
const boundProvider = await provider.bind(config);
```

Where config is used for provider-specific configuration, generally authentication for now.

```typescript
interface Config {
  auth?: {
    basic?: {
      username: string;
      password: string;
    };
    bearer?: {
      token: string;
    };
    apikey?: {
      key: string;
    };
  };
}
```

With `BoundProvider`, you can now perform your usecase:

```typescript
const result = await boundProvider.perform(input);
if (result.ok) {
  console.log('Success!', result.value);
}
```

where `input` depends on your usecase.

## Security

Superface is not man-in-the-middle so it does not require any access to secrets that are needed to communicate with provider API. Superface SDK only reads super.json file, resolved authorization secrets from environment variables or from the file itself and applies them to network requests as required by the specific map.

More about the journey of the secrets within sdk can be found in [Security](SECURITY.md).

## Support

If you need any additional support, have any questions or you just want to talk you can do that through our [documentation page](https://developer.superface.dev). 

## Maintainers

- [@Lukáš Valenta](https://github.com/lukas-valenta)
- [@Edward](https://github.com/TheEdward162)
- [@Vratislav Kalenda](https://github.com/Vratislav)
- [@Z](https://github.com/zdne)

## Contributing

**Please open an issue first if you want to make larger changes**

Feel free to contribute! Please follow the [Contribution Guide](CONTRIBUTION_GUIDE.md).

## Licensing

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
