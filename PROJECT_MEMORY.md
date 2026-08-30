# Project memory: graceful-fs

Updated: 2026-08-30
State: GO / BUILDING - recursive dependency remediation

## Identity

- Target: `@stackline/graceful-fs@1.0.0`
- Upstream baseline: exact ISC npm artifact `graceful-fs@4.2.11`
- Upstream SHA-256:
  `3961374aa161e6fed80d6f4b6aaf2fb7eafd2c9e5be34e865b375f0114dd099c`
- Runtime, optional and peer dependencies: zero
- Canonical Drive decision ID: `1fSkwInY9EyfZYQCURnMdOGiTUS6jAY-v`

## Current decision

The owner-directed recursive closure policy supersedes the 2026-08-29 NO_GO.
This package is the required zero-dependency leaf for the already-published
`@stackline/fstream@1.0.0` and
`@stackline/fs-write-stream-atomic@1.0.0` remediation chain.

The reconsidered implementation removes both prior data-integrity blockers:

- public `writeFile` no longer enters the custom >=2 GiB chunk path before
  native option validation;
- numeric `O_APPEND` flags are excluded from whole-operation EAGAIN replay;
- short historical queue records are not rewritten into timed records.

Non-extensible namespace handling, bounded asynchronous retries, stream
lifecycle handling, prototype-pollution regressions and the 4.2.11 public
contract remain covered.

## Release order

1. Finish, verify and publish `@stackline/graceful-fs@1.0.0`.
2. Republish `@stackline/fstream` with
   `"graceful-fs": "npm:@stackline/graceful-fs@1.0.0"`.
3. Republish `@stackline/fs-write-stream-atomic` with the same exact alias.
4. Re-run clean direct and historical-key installs for both parent closures.

Never replace an existing npm version. Every parent uses a new patch version.
