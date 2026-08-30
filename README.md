# @stackline/graceful-fs

A compatibility-first maintained continuation of `graceful-fs@4.2.11`.

This package is independently maintained and is not affiliated with or
endorsed by the original graceful-fs maintainers.

It preserves the CommonJS `fs`-like object, the process-wide EMFILE/ENFILE
queue, close-triggered retries, streams, `gracefulify`, deep entry files, and
the historical ISC license. It adds independently implemented fixes for
non-extensible module namespaces, bounded non-recursive retries, selected
path-owned asynchronous EAGAIN failures, and stream lifecycle retention.

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

## Compatibility choices

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

See [COMPATIBILITY_CONTRACT.md](COMPATIBILITY_CONTRACT.md) and
[MIGRATION.md](MIGRATION.md) for the complete contract and limits.

## Supported runtimes

The runtime floor is Node 14.14. CI packs and installs the exact candidate on
14.14, 16, 18, 20, 22, 24 and 26. Declarations are tested with TypeScript 3.9
and the current supported compiler. The full correctness suite runs on current
supported Node lines, with Linux, macOS and Windows coverage.

## Security

Filesystem retry code can affect every caller in a process. Report suspected
vulnerabilities privately as described in [SECURITY.md](SECURITY.md). Do not
include secrets or exploit payloads in public issues.

## Provenance

The only source baseline is the exact ISC-licensed npm artifact for
`graceful-fs@4.2.11`, SHA-256
`3961374aa161e6fed80d6f4b6aaf2fb7eafd2c9e5be34e865b375f0114dd099c`.
The later BlueOak-licensed upstream repository state was not used as a source
baseline. See [NOTICE](NOTICE), [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md),
and [UPSTREAM_AUDIT.md](UPSTREAM_AUDIT.md).

## License

ISC. Copyright and permission notices are preserved in [LICENSE](LICENSE).
