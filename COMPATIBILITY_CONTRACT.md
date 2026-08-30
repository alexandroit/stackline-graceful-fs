# Compatibility contract

This contract supersedes the rejected 2026-08-29 draft. Numeric append flags
are now excluded from EAGAIN replay, and the unsafe public large-write extension
was removed before release.

## Public surface

- CommonJS root object with the complete `graceful-fs@4.2.11` own-name and
  descriptor surface on each tested Node runtime.
- Current `node:fs` own-name surface, except symbols intentionally omitted by
  the historical clone algorithm. The shared queue symbol remains on global
  and native `fs`, not on the ordinary cloned package export.
- Historical deep files: `clone.js`, `polyfills.js`, and `legacy-streams.js`.
  In particular, `clone.length === 1` and functions pass through unchanged.
- First-party TypeScript declaration gated with Node 14 types on TypeScript 3.9
  and the current supported compiler.
- Native stream prototypes and option lookup behavior, including inherited
  options and custom `fs` implementations.

## Queue and timing contract

EMFILE and ENFILE retain the shared `Symbol.for('graceful-fs.queue')` array.
Every record uses the 4.2.11 five-slot wire format:

1. retry function;
2. argument array;
3. last error;
4. absolute start time;
5. last-attempt time.

Successful descriptor closes cancel an older delayed retry and schedule queue
progress asynchronously. They reset descriptor-pressure timing and preserve
FIFO callback-once behavior. No retry operation is synchronously re-entered.

EAGAIN is kept out of that shared queue. Its module-local queue has its own
timer and absolute deadline, so a 4.2.11 copy loaded first cannot
extend EAGAIN work through its broad close reset.

## EAGAIN scope

New EAGAIN handling covers only path-owned asynchronous operations for which a
whole-operation replay is bounded and non-destructive:

- `open`
- `readFile(path, ...)`
- `writeFile(path, ...)` without an append flag
- `copyFile`
- `readdir`

It excludes `appendFile`, string or numeric append-flag `writeFile`, numeric-descriptor
`readFile`/`writeFile`, and new synchronous operations. These exclusions are
intentional data-integrity boundaries, not missing test coverage.

## Large-buffer behavior

Callback `writeFile` delegates option validation and large-buffer behavior to
the native implementation. The package does not ship the rejected custom
chunking path, so invalid options cannot open or truncate a target first.

## Global patching

`gracefulify(require('node:fs'))` continues to patch the mutable CJS object for
top-level applications such as npm CLI. Libraries should not globally patch
`fs`. A non-extensible ESM namespace cannot be mutated; `gracefulify` returns
a reset-aware mutable clone instead.

## Runtime range

Runtime syntax and packed consumers are gated on Node 14.14, 16, 18, 20, 22,
24 and 26. Correctness and Windows behavior are additionally gated on hosted
Linux/Windows matrices for Node 20, 22, 24 and 26.
