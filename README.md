# Superface One SDK _(one-sdk-js)_

<img src="https://github.com/superfaceai/one-sdk-js/blob/main/docs/LogoGreen.png" alt="superface logo" width="150" height="150">

Superface is the core SDK of the Superface project. It is the library that communicates with registry and performs operations on profiles/maps, including input/output validations.

<!--TODO: Fill out this long description. So, should we fill it :) -->

## Table of Contents

- [Background](#background)
- [Install](#install)
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

To install the package, run in the project directory:

```
# npm users
npm install @superfaceai/sdk
# yarn users
yarn add @superfaceai/sdk
```

## Usage

### Untyped

To interact with superface create a new superface client instance:

```typescript
import { SuperfaceClient } from '@superface/one-sdk';

const client = new SuperfaceClient();
```

Make sure a profile is installed by running `superface install <profileName>[@<profileVersion>]` in the project directory, then load the profile:

```typescript
const profile = await client.getProfile('<profileName>');
```

Next, make sure at least one provider is configured in super.json or select one manually. You can configure providers in super.json by running `superface configure <providerName>` and you can add additional or overriding configuration by calling `.configure` on the Provider object:

```typescript
const provider = await client.gerProvider('<providerName>');
// provider.configure(...)
```

Then, obtain a usecase and perform it with selected provider:

```typescript
const result = await profile.getUsecase('<usecaseName>').perform(
  {
    inputField: 1,
    anotherInputField: 'hello',
  },
  { provider } // optional, if missing selects first configured provider from super.json
);
```

### Typed

You can also use generated typed client, which is very similar:

Make sure a profile is installed with types by running `superface install --types <profileName>[@<profileVersion>]` in the project directory.

```typescript
import { SuperfaceClient } from 'superface/sdk'; // This should point to superface directory in project root

const client = new SuperfaceClient();
const profile = await client.getProfile('<profileName>'); // This should now autocomplete your installed profileVersion
const result = await profile.useCases.<usecase>.perform(
  {
    inputField: 1,
    anotherInputField: 'hello',
  },
  { provider } // optional, if missing selects first configured provider from super.json
);
```

Lastly, unwrap result value or possible error. Result is using [neverthrow](https://github.com/supermacro/neverthrow) approach so there are multiple ways to work with result. 

You can use `isOk()` or `isErr()`to check type of result: 

```typescript
if (result.isErr()) {
  // Result is error, error.toString() returns human readable description of what went wrong
  console.log(result.error.toString());
} else {
  // Result is ok and you can accees value here
  console.log(result.value);
}
```

Or you can just use `unwrap`, which is less safe:

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
