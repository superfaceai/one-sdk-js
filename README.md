# superface

## Install

To install the package, first create `.npmrc` file in your project root and put the following line into it.

```
@superfaceai:registry=https://npm.pkg.github.com
```

Then authenticate to github npm package registry. Use your github name as your login and generate a personal access token with at least `repo` and `read:packages` permissions in Github to use as password:

```
npm login --registry=https://npm.pkg.github.com
```

After doing this, you should be able to install the package by calling:

```
yarn add @superfaceai/superface
```

## Publishing a new version

Package publishing is done through GitHub release functionality.

[Draft a new release](https://github.com/superfaceai/superface/releases/new) to publish a new version of the package.

Use semver for the version tag. It must be in format of `v<major>.<minor>.<patch>`.

Github Actions workflow will pick up the release and publish it as one of the [packages](https://github.com/superfaceai/superface/packages).

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
