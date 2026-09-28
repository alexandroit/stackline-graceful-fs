# @stackline/graceful-fs

> A compatibility-first maintained continuation of graceful-fs with bounded filesystem retries.

[![npm version](https://img.shields.io/npm/v/@stackline/graceful-fs.svg?style=flat-square)](https://www.npmjs.com/package/@stackline/graceful-fs)
[![license](https://img.shields.io/npm/l/@stackline/graceful-fs.svg?style=flat-square)](https://github.com/alexandroit/stackline-graceful-fs/blob/main/LICENSE)
[![GitHub repository](https://img.shields.io/badge/GitHub-Repository-181717?style=flat-square&logo=github)](https://github.com/alexandroit/stackline-graceful-fs)

**[Documentation](https://alexandro.net/docs/vanilla/graceful-fs/)** |
**[npm](https://www.npmjs.com/package/@stackline/graceful-fs)** |
**[Issues](https://github.com/alexandroit/stackline-graceful-fs/issues)** |
**[Repository](https://github.com/alexandroit/stackline-graceful-fs)**

**Package version:** `1.0.1`

## Why this package?

A compatibility-first maintained continuation of `graceful-fs@4.2.11`.

This package is independently maintained and is not affiliated with or
endorsed by the original graceful-fs maintainers.

It preserves the CommonJS `fs`-like object, the process-wide EMFILE/ENFILE
queue, close-triggered retries, streams, `gracefulify`, deep entry files, and
the historical ISC license. It adds independently implemented fixes for
non-extensible module namespaces, bounded non-recursive retries, selected
path-owned asynchronous EAGAIN failures, and stream lifecycle retention.

<a id="provenance"></a>

### Provenance

The only source baseline is the exact ISC-licensed npm artifact for
`graceful-fs@4.2.11`, SHA-256
`3961374aa161e6fed80d6f4b6aaf2fb7eafd2c9e5be34e865b375f0114dd099c`.
The later BlueOak-licensed upstream repository state was not used as a source
baseline. See [NOTICE](https://github.com/alexandroit/stackline-graceful-fs/blob/main/NOTICE), [THIRD_PARTY_LICENSES.md](https://github.com/alexandroit/stackline-graceful-fs/blob/main/THIRD_PARTY_LICENSES.md),
and [UPSTREAM_AUDIT.md](https://github.com/alexandroit/stackline-graceful-fs/blob/main/UPSTREAM_AUDIT.md).

## Compatibility

| Item | Value |
| --- | --- |
| Package | `@stackline/graceful-fs@1.0.1` |
| Node.js runtime | `>=14.14` |
| CommonJS / primary entry | `graceful-fs.js` |
| Type declarations | `index.d.ts` |

<a id="compatibility-choices"></a>

### Compatibility choices

- `require('@stackline/graceful-fs')` returns an `fs`-like CommonJS object. It
  is not a function.
- Like `graceful-fs@4.2.11`, this package has no native ESM or browser entry.
  Node ESM consumers use the standard CommonJS default-import interop; browser
  bundling is outside this release's filesystem-runtime contract.
- EMFILE and ENFILE use the historical five-slot array records in the shared
  `Symbol.for('graceful-fs.queue')` queue, so mixed 4.2.11 installations can
  consume each other's work.
- EAGAIN has a separate module-local queue and an absolute 60-second deadline.
  Unrelated descriptor closes cannot extend it.
- EAGAIN replay is limited to path-owned asynchronous `open`, `readFile`,
  non-append `writeFile`, `copyFile`, and `readdir`. It is deliberately not
  used for `appendFile`, append flags, or numeric-descriptor reads/writes,
  where partial side effects can make replay destructive.
- This release does not claim to fix the synchronous ZFS operations that
  motivated pnpm's issue-258 report. Existing `read`/`readSync` handling from
  4.2.11 remains, but other synchronous APIs are not newly retried.
- Callback `writeFile` preserves native option validation and large-buffer
  behavior. This release deliberately does not add the issue-256 chunking
  extension because validation must occur before any open or truncate side
  effect.
- `gracefulify(extensibleFs)` patches and returns the object. For a
  non-extensible ESM namespace it returns a mutable patched clone and leaves
  the namespace unchanged; callers must use the returned value.

See [COMPATIBILITY_CONTRACT.md](https://github.com/alexandroit/stackline-graceful-fs/blob/main/COMPATIBILITY_CONTRACT.md) and
[MIGRATION.md](https://github.com/alexandroit/stackline-graceful-fs/blob/main/MIGRATION.md) for the complete contract and limits.

<a id="supported-runtimes"></a>

### Supported runtimes

The runtime floor is Node 14.14. CI packs and installs the exact candidate on
14.14, 16, 18, 20, 22, 24 and 26. Declarations are tested with TypeScript 3.9
and the current supported compiler. The full correctness suite runs on current
supported Node lines, with Linux, macOS and Windows coverage.

## Installation

```sh
npm install @stackline/graceful-fs
```

## Usage

```sh
npm install @stackline/graceful-fs
```

```js
const fs = require('@stackline/graceful-fs')

fs.readFile('example.txt', 'utf8', (error, text) => {
  if (error) throw error
  console.log(text)
})
```

For a migration without source changes, retain the historical dependency key
with an npm alias:

```json
{
  "dependencies": {
    "graceful-fs": "npm:@stackline/graceful-fs@^1.0.0"
  }
}
```

## Security

Filesystem retry code can affect every caller in a process. Report suspected
vulnerabilities privately as described in [SECURITY.md](https://github.com/alexandroit/stackline-graceful-fs/blob/main/SECURITY.md). Do not
include secrets or exploit payloads in public issues.

## Local Development

```sh
git clone https://github.com/alexandroit/stackline-graceful-fs.git
cd stackline-graceful-fs
npm ci
npm run test
```

Release tooling uses Node.js 24.20.0 and npm 11.19.0. The consumer runtime contract remains the one documented above.

## Release Checklist

Run `npm run test` and inspect the package contents before release. Publish a new version through the [GitHub Actions publishing workflow](https://github.com/alexandroit/stackline-graceful-fs/actions/workflows/publish.yml), using the SHA-512 digest of the reviewed tarball. Verify the exact published version, tarball integrity, and npm provenance after the run.

## Community and Support

Report reproducible package issues in the [issue tracker](https://github.com/alexandroit/stackline-graceful-fs/issues). Use the [security policy](https://github.com/alexandroit/stackline-graceful-fs/blob/main/SECURITY.md) for vulnerability reports.

- [Stackline / Alexandro.Net](https://alexandro.net/)
- [GitHub](https://github.com/alexandroit)
- [Maintainer LinkedIn](https://www.linkedin.com/in/aleinfo/)
- [Reddit community: r/Stackline](https://www.reddit.com/r/Stackline/)

## License

ISC. Copyright and permission notices are preserved in [LICENSE](https://github.com/alexandroit/stackline-graceful-fs/blob/main/LICENSE).
