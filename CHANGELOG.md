# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.5.2] - 2022-06-15

## [1.5.1] - 2022-06-14
### Fixed
- Do not recache ProviderConfiguration on security values change
- Do not call `Config.instance()` in the global scope to defer reading of env variables
- Refactor security values passing in `perform`

## [1.5.0] - 2022-06-09
### Added
- SuperfaceClient supports passing SuperJson as constructor parameter
- Pass security values in `perform`

## [1.4.1] - 2022-05-17
### Fixed
- Send multipart boundary in content-type header for `multipart/form-data`

## [1.4.0] - 2022-05-17
### Added
- Sandbox stdlib - `std.unstable.time.{isoDateToUnixTimestamp, unixTimestampToIsoDate}, std.unstable.debug.log`
- `provider.json` caching
- Superjson simple retry policy configuration is now supported
- Superjson circuit breaker configuration accepts `openTime` (default 30s, previously hardcoded)

### Changed
- Default backoff start value changed from 50ms to 500ms

### Fixed
- Fixed iterated variable in `foreach` being merged instead of overwritten, breaking iteration of objects
- Fixed Buffer (`Buffer.isBuffer(x) == true`) being considered a composite structure and being merged as an object
- Fixed authentication clearing query parameters
- Fixed url path parameter replacement not working with whitespace around replacement keys
- Fixup of arrays coming from vm2 sandbox

## [1.3.0] - 2022-02-15
### Added
- Added support for service selection in http calls
- Added support for digest authentication in http calls

## [1.2.2] - 2022-02-11
### Added
- Make sandbox timeout configurable through environment variable `SUPERFACE_SANDBOX_TIMEOUT`

## [1.2.1] - 2022-01-19
This is a recovery release after introduction of compatibility-breaking changes in version 1.2.0.

### Changed
- No changes since 1.1.0

## [1.1.0] - 2021-12-22
### Added
- Pass integration parameters in `perform`

### Fixed
- Display query parameters in URL with `DEBUG=superface:http:sensitive`

## [1.0.1] - 2021-11-24
### Added
- Use [JSON Pointer](https://datatracker.ietf.org/doc/html/rfc6901) (arrays not supported) to specify api token location in body

### Fixed
- ProfileParameterValidator now resolves named models before field references
- Buffer serialization in request body
- `undefined` values are removed when stringifying records

## [1.0.0] - 2021-11-04
### Added
- Module for mocking of Superface components
- MapInterpreter now supports integration parameters

### Changed
- Removed unnecessary result propagation in interpreter - using stackTop.result instead
- Terminal outcome statements should now correctly exit from iteration
- MappedHTTPErrors and MappedErrors are handled a little better
- Parser uses AST metadata to check if source was changed
- Profile provider resolves integration parameters and fallback to default during `bind`

### Removed
- replaced zod with ast validations
- deprecated cacheBoundProfileProvider function on SuperfaceClient

### Fixed
- operation call no longer overwrites already mapped result
- caller scope no longer leaks into operation callees
- `result` variable no longer has special meaning
- `outcome.data` is no longer overwritten by `result`
- `fail` correctly sets `outcome.error` in caller
- errors are passed correctly through multiple levels of operation calls
- inline calls throw error when they fail
- Integration parameters are passed from super.json to BoundProfileProvider

## [0.0.40] - 2021-10-18
### Changed
- Updated AST with examples

## [0.0.39] - 2021-10-18

## [0.0.38] - 2021-10-16
### Fixed
- Log warning when user does not handle rejections properly
- Locked AST version with matching schemas from parser

## [0.0.37] - 2021-10-14
### Added
- Make `configuration` of `BoundProfileProvider` public

### Changed
- Removed unnecessary result propagation in interpreter - using stackTop.result instead
- Terminal outcome statements should now correctly exit from iteration
- **BREAKING CHANGE**: provider.json schemas moved to ast

### Fixed
- **BREAKING CHANGE**: absolute URLs are no longer allowed in maps
- **BREAKING CHANGE**: interpolation no longer works in base URLs

## [0.0.36] - 2021-09-29
### Added
- Export `PerformError` class
- Export `ErrorBase`, `SDKExecutionError` and `UnexpectedError` classes

### Fixed
- Use super.json `priority` correctly
- provider names are validated across super.json, provider.json and map file header
- when fetch throws an unknown error, it gets passed down the failover machinery

## [0.0.33] - 2021-08-31

## [0.0.31] - 2021-08-25
### Added
- Superjson mutate set methods for profile, profileProvider and provider

## [0.0.30] - 2021-08-24
### Added
- Failover event adapter failover restore in `pre-bind-and-perform` hook
- Maps and profiles are parsed on-the-fly
- Superjson mutate swap variant methods for provider and profile provider

### Changed
- Failover event adapter tests are now parametrized over untyped and typed client, removing repeated code
- Failover event adapter structure, abstracted repeated code
- `pre-` event `abort` resolution does not prevent `post-` event from being emitted
- Streamlined how `reason` is propagated and handled in failure policies, implemented `FailurePolicyReason`
- ProfileProvider can now fetch provider json when a map is local
- Config now has friendlier API
- every `throw` now uses an instance of an Error subclass

## [0.0.29] - 2021-07-20
### Added
- `MetricReporter` class that hooks on various events and reports metrics to Superface backend services
- Internal Event system
- Interface and implementation of backoffs
- Interface for failure policies
- Implementation of common failure policies

### Changed
- `ErrorBase` now contains `toString()` method and getter for `Symbol.toStringTag`
- `CrossFetchError` is now union of `NetworkFetchError` and `RequestFetchError` classes
- `SuperfaceClient::getProvider` throws if the provider is not found
- `SuperfaceClient::getProviderForProfile` no longer takes an optional non-documented preference argument
- `FailurePolicyRouter::constructor` now takes a function which is called to instantiate policy for specified provider

## [0.0.28] - 2021-06-15
### Added
- Superjson config hash for analytics

## [0.0.27] - 2021-05-17
### Changed
- Errors returned (mostly) security value resolution and from http client are now friendlier

### Fixed
- NonNullable types in ProfileParameterValidator

## [0.0.26] - 2021-05-07
### Added
- ENV variable to change superface path

## [0.0.25] - 2021-05-04
### Added
- Provider name check

## [0.0.23] - 2021-04-28
### Added
- ENV variable to change API URL

## [0.0.22] - 2021-04-26
### Added
- user agent header to HTTP requests

### Changed
- changed API URLs to public

## [0.0.21] - 2021-04-26
### Added
- Export TypedProfile class

## [0.0.19] - 2021-04-23
### Added
- Logging to ProfileParameterValidator
- Status code to mapped errors

### Changed
- Preserve trailing slash in URLs

## [0.0.18] - 2021-04-23
### Changed
- Throw error when usecase not found

## [0.0.17] - 2021-04-22
### Changed
- Improved Result documentation

## [0.0.16] - 2021-04-22
### Changed
- Renamed repository to `one-sdk-js`

## [0.0.15] - 2021-04-21
### Added
- Typed SDK interface

### Changed
- Default result type from `unknown` to `any` in perform method

## [0.0.14] - 2021-03-25
### Added
- Security configuration merged from schemes in provider.json and values in super.json

### Changed
- Env variable resolution is not part of SuperJson normalization

## [0.0.13] - 2021-03-17
### Fixed
- Only combine URL and base URL after interpolation

## [0.0.12] - 2021-03-17
### Fixed
- Narrow interpolation parameter regex
- Pass headers and status code to HTTP response handler

## [0.0.11] - 2021-03-15
### Added
- New untyped SuperfaceClient, Profile, Provider, Usecase API

### Changed
- Refactored Result library

### Fixed
- Correctly resolve nested variables in path params
- Normalize url when building it in for http requests

## [0.0.10] - 2021-03-11
### Added
- provider.json zod schemes

## [0.0.9] - 2021-02-25
### Added
- super.json support
- Environment variable resolution from super.json
- Normalized super.json representation

### Changed
- `Provider` class interface simplified
- File uris to use `file://` protocol prefix
- Simplified the parameters to MapInterpreter

## [0.0.8] - 2021-02-11
### Added
- Iteration support in Maps

### Fixed
- Incorrect scoping

## [0.0.7] - 2021-01-21
### Fixed
- Inline call and call statement not correctly handling call stack arguments
- Array handling in mergeVariables function

## [0.0.6] - 2021-01-11
### Changed
- Updated AST version

## [0.0.5] - 2020-12-22
### Changed
- Enhanced logging of HTTP Errors

## [0.0.4] - 2020-12-15
### Added
- Better DX and error experience
- Debug logging to map interpreter
- Sandbox tests

### Changed
- Repository and package name
- `Provider` and `BoundProvider` interface

## [0.0.3] - 2020-11-25
### Added
- Providers
- Profile and map fetching functions
- Service finder
- Apikey http security scheme

### Changed
- Readme using convention
- Name of the package scope to `@superfaceai`
- Sandbox tests and return values

### Removed
- Unused interfaces

### Fixed
- Github workflow actions failing due to github security update

## 0.0.1 - 2020-08-31
### Added
- Map interpreter
- `vm2` based js sandbox
- Profile parameter validator
- CI/CD workflows

[Unreleased]: https://github.com/superfaceai/one-sdk-js/compare/v1.5.2...HEAD
[1.5.2]: https://github.com/superfaceai/one-sdk-js/compare/v1.5.1...v1.5.2
[1.5.1]: https://github.com/superfaceai/one-sdk-js/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/superfaceai/one-sdk-js/compare/v1.4.1...v1.5.0
[1.4.1]: https://github.com/superfaceai/one-sdk-js/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/superfaceai/one-sdk-js/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/superfaceai/one-sdk-js/compare/v1.2.2...v1.3.0
[1.2.2]: https://github.com/superfaceai/one-sdk-js/compare/v1.2.1...v1.2.2
[1.2.1]: https://github.com/superfaceai/one-sdk-js/compare/v1.1.0...v1.2.1
[1.1.0]: https://github.com/superfaceai/one-sdk-js/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/superfaceai/one-sdk-js/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/superfaceai/one-sdk-js/compare/v0.0.40...v1.0.0
[0.0.40]: https://github.com/superfaceai/one-sdk-js/compare/v0.0.39...v0.0.40
[0.0.39]: https://github.com/superfaceai/one-sdk-js/compare/v0.0.38...v0.0.39
[0.0.38]: https://github.com/superfaceai/one-sdk-js/compare/v0.0.37...v0.0.38
[0.0.37]: https://github.com/superfaceai/one-sdk-js/compare/v0.0.36...v0.0.37
[0.0.36]: https://github.com/superfaceai/one-sdk-js/compare/v0.0.33...v0.0.36
[0.0.33]: https://github.com/superfaceai/one-sdk-js/compare/v0.0.31...v0.0.33
[0.0.31]: https://github.com/superfaceai/one-sdk-js/compare/v0.0.30...v0.0.31
[0.0.30]: https://github.com/superfaceai/one-sdk-js/compare/v0.0.29...v0.0.30
[0.0.29]: https://github.com/superfaceai/one-sdk-js/compare/v0.0.28...v0.0.29
[0.0.28]: https://github.com/superfaceai/one-sdk-js/compare/v0.0.27...v0.0.28
[0.0.27]: https://github.com/superfaceai/one-sdk-js/compare/v0.0.26...v0.0.27
[0.0.26]: https://github.com/superfaceai/one-sdk-js/compare/v0.0.25...v0.0.26
[0.0.25]: https://github.com/superfaceai/one-sdk-js/compare/v0.0.23...v0.0.25
[0.0.23]: https://github.com/superfaceai/one-sdk-js/compare/v0.0.22...v0.0.23
[0.0.22]: https://github.com/superfaceai/one-sdk-js/compare/v0.0.21...v0.0.22
[0.0.21]: https://github.com/superfaceai/one-sdk-js/compare/v0.0.19...v0.0.21
[0.0.19]: https://github.com/superfaceai/one-sdk-js/compare/v0.0.18...v0.0.19
[0.0.18]: https://github.com/superfaceai/one-sdk-js/compare/v0.0.17...v0.0.18
[0.0.17]: https://github.com/superfaceai/one-sdk-js/compare/v0.0.16...v0.0.17
[0.0.16]: https://github.com/superfaceai/one-sdk-js/compare/v0.0.15...v0.0.16
[0.0.15]: https://github.com/superfaceai/one-sdk-js/compare/v0.0.14...v0.0.15
[0.0.14]: https://github.com/superfaceai/one-sdk-js/compare/v0.0.13...v0.0.14
[0.0.13]: https://github.com/superfaceai/one-sdk-js/compare/v0.0.12...v0.0.13
[0.0.12]: https://github.com/superfaceai/one-sdk-js/compare/v0.0.11...v0.0.12
[0.0.11]: https://github.com/superfaceai/one-sdk-js/compare/v0.0.10...v0.0.11
[0.0.10]: https://github.com/superfaceai/one-sdk-js/compare/v0.0.9...v0.0.10
[0.0.9]: https://github.com/superfaceai/one-sdk-js/compare/v0.0.8...v0.0.9
[0.0.8]: https://github.com/superfaceai/one-sdk-js/compare/v0.0.7...v0.0.8
[0.0.7]: https://github.com/superfaceai/one-sdk-js/compare/v0.0.6...v0.0.7
[0.0.6]: https://github.com/superfaceai/one-sdk-js/compare/v0.0.5...v0.0.6
[0.0.5]: https://github.com/superfaceai/one-sdk-js/compare/v0.0.4...v0.0.5
[0.0.4]: https://github.com/superfaceai/one-sdk-js/compare/v0.0.3...v0.0.4
[0.0.3]: https://github.com/superfaceai/one-sdk-js/compare/v0.0.1...v0.0.3
