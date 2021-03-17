## [Unreleased]

### Fixed
* Pass headers and status code to HTTP response handler
* Only combine URL and base URL after interpolation
* Narrow interpolation parameter regex

## [0.0.11] - 2021-03-15

### Added
* New untyped SuperfaceClient, Profile, Provider, Usecase API

### Changed
* Refactored Result library

### Fixed
* Correctly resolve nested variables in path params
* Normalize url when building it in for http requests

## [0.0.10] - 2021-03-11

### Added
* provider.json zod schemes

## [0.0.9] - 2021-02-25

### Added
* super.json support
* Environment variable resolution from super.json
* Normalized super.json representation

### Changed
* `Provider` class interface simplified
* File uris to use `file://` protocol prefix
* Simplified the parameters to MapInterpreter

## [0.0.8] - 2021-02-11

### Added
* Iteration support in Maps

### Fixed
* Incorrect scoping

## [0.0.7] - 2021-01-21

### Fixed
* Inline call and call statement not correctly handling call stack arguments
* Array handling in mergeVariables function

## [0.0.6] - 2021-01-11

### Changed
* Updated AST version

## [0.0.5] - 2020-12-22

### Changed
* Enhanced logging of HTTP Errors

## [0.0.4] - 2020-12-15

### Added
* Better DX and error experience
* Debug logging to map interpreter
* Sandbox tests

### Changed
* Repository and package name
* `Provider` and `BoundProvider` interface

## [0.0.3] - 2020-11-25

### Added
* Providers
* Profile and map fetching functions
* Service finder
* Apikey http security scheme

### Changed
* Readme using convention
* Name of the package scope to `@superfaceai`
* Sandbox tests and return values

### Removed
* Unused interfaces

### Fixed
* Github workflow actions failing due to github security update

## [0.0.1] - 2020-08-31

### Added
* Map interpreter
* `vm2` based js sandbox
* Profile parameter validator
* CI/CD workflows


[Unreleased]: https://github.com/superfaceai/sdk-js/compare/v0.0.11...HEAD
[0.0.11]: https://github.com/superfaceai/sdk-js/compare/v0.0.10...v0.0.11
[0.0.10]: https://github.com/superfaceai/sdk-js/compare/v0.0.9...v0.0.10
[0.0.9]: https://github.com/superfaceai/sdk-js/compare/v0.0.8...v0.0.9
[0.0.8]: https://github.com/superfaceai/sdk-js/compare/v0.0.7...v0.0.8
[0.0.7]: https://github.com/superfaceai/sdk-js/compare/v0.0.6...v0.0.7
[0.0.6]: https://github.com/superfaceai/sdk-js/compare/v0.0.5...v0.0.6
[0.0.5]: https://github.com/superfaceai/sdk-js/compare/v0.0.6...v0.0.5
[0.0.4]: https://github.com/superfaceai/sdk-js/compare/v0.0.3...v0.0.4
[0.0.3]: https://github.com/superfaceai/sdk-js/compare/v0.0.1...v0.0.3
[0.0.1]: https://github.com/superfaceai/sdk-js/releases/tag/v0.0.1
