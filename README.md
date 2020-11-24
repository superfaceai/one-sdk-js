# superface


Superface is the core SDK of the Superface project. It is the library that communicates with registry and performs operations on profiles/maps, including input/output validations.

TODO: Fill out this long description.

## Table of Contents

- [Install](#install)
- [Publishing a new version](#publish)
- [Usage](#usage)
- [API](#api)
- [Maintainers](#maintainers)
- [Contributing](#contributing)
- [Licensing](#licensing)
- [License](#license)

## Install

To install the package, first create `.npmrc` file in your project root and put the following line into it.

```
@superfaceai:registry=https://npm.pkg.github.com
```

Then authenticate to github npm package registry. Use your github name as your login and generate a personal access token with at least the `repo` and `read:packages` permission in Github to use as password:

```
npm login --registry=https://npm.pkg.github.com
```

After doing this, you should be able to install the package by calling:

```
yarn add @superfaceai/superface
```

## Publishing a new version

Package publishing is done through GitHub release functionality.

Draft a new release to publish a new version of the package.

Use semver for the version tag. It must be in format of `v<major>.<minor>.<patch>`.

Github Actions workflow will pick up the release and publish it as one of the packages.

## Usage

To perform a usecase, you need a Provider instance. You can either fetch one from registry, or create your own.

### ServiceFinderQuery
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

### Without ServiceFinder
If you don't use the registry, you can also construct `Provider` directly, providing Map AST or URL.

```typescript
  const provider = new Provider(
    profileAST,
    mapUrlOrMapAST,
    usecase,
    baseUrl,
  );
```

Where `profileAST` is the compiled AST of profile, `mapUrlOrMapAST` is either URL or AST of the Map, `usecase` is the name of the usecase you want to perform and (optional) `baseUrl` is the base URL of the service, in case your Map uses relative paths. After creating the `Provider`, you can continue with binding as above.


### Performing the usecase

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

## Maintainers

- [@Lukáš Valenta](https://github.com/lukas-valenta)
- [@Edward](https://github.com/TheEdward162)
- [@Vratislav Kalenda](https://github.com/Vratislav)
- [@Z](https://github.com/zdne)

## Contributing

PRs accepted.

Small note: If editing the README, please conform to the [standard-readme](https://github.com/RichardLitt/standard-readme) specification.

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
- UNLICENSED

## License

`<TBD>` © 2020 Superface
