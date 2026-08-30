# Upstream audit: `graceful-fs`

Date: 2026-08-29
Decision written: 2026-08-29T04:16:08Z
Historical decision: 2026-08-29T05:30:16Z
Current decision: **GO - OWNER-DIRECTED DEPENDENCY REMEDIATION**
Current reason: `REQUIRED_ZERO_DEPENDENCY_LEAF_FOR_TWO_PUBLISHED_STACKLINE_PARENTS`

The original **GO — BUILDING** decision was written before implementation began
with reason
`ACTIVE_CORE_FS_COMPATIBILITY_DEFECTS_WITH_QUALIFIED_DIRECT_ADOPTION_PATHS_AND_NO_MAINTAINED_DROP_IN`.
It is preserved in `decision.json`. The final decision below supersedes it.

## Selection and demand

`graceful-fs` is the effective rank-1 eligible Scout intake candidate; its canonical package-queue rank is not applicable until the GO transaction is recorded. There is no unresolved `requiredNextCycle` pin, no `CODEX_READY` package, and no release checkpoint; pin disposition is `NOT_PINNED`. The official npm downloads endpoint reported 170,380,490 downloads for the latest complete week, 2026-08-22 through 2026-08-28. Downloads are install events, not unique users, so volume is supporting evidence rather than the GO reason.

- Registry: https://registry.npmjs.org/graceful-fs
- Complete-week observation: https://api.npmjs.org/downloads/point/2026-08-22:2026-08-28/graceful-fs
- Upstream repository: https://github.com/isaacs/node-graceful-fs

## Provenance and legal boundary

The only source baseline is the published `graceful-fs@4.2.11` npm artifact:

- Published: 2023-03-16T19:30:19.323Z
- Tarball: https://registry.npmjs.org/graceful-fs/-/graceful-fs-4.2.11.tgz
- SHA-1: `4183e4e8bf08bb6e05bbb2f7d2e0c8f712ca40e3`
- SHA-256: `3961374aa161e6fed80d6f4b6aaf2fb7eafd2c9e5be34e865b375f0114dd099c`
- SRI: `sha512-RbJ5/jmFcNNCcDV5o9eTnBLJ/HszWV0P73bc+Ff4nS/rJj+YaS6IGyiOL0VoBYX+l1Wrl3k63h/KrH+nhJ0XvQ==`
- Runtime dependencies: none
- Artifact license: ISC

The upstream repository currently points at commit `f7a43701434b3e8f1c3c9fe9df972330de8b7ecb`, whose 2025-10-25 change replaces the repository license with BlueOak-1.0.0. The published artifact remains ISC. Stackline will preserve the artifact's complete ISC notice and attribution. Later fixes are independently designed from observed behavior, issue reports and public API contracts; later repository code is not copied.

## Upstream reports and reproduced defects

- [#245](https://github.com/isaacs/node-graceful-fs/issues/245): non-extensible `node:fs` module namespaces cannot accept queue symbols or patched stream properties. Exact 4.2.11 reproduced a `TypeError` when a loader/bundler supplied that namespace for the package's internal `fs` request, and when the namespace was passed directly to `gracefulify`. Ordinary native ESM importing the CommonJS package still gives its internals mutable `require('fs')` and is not claimed to fail.
- [#248](https://github.com/isaacs/node-graceful-fs/issues/248): the custom `createWriteStream` wrapper has a reported retention leak, also tracked by [fs-extra #1042](https://github.com/jprichardson/node-fs-extra/issues/1042).
- [#256](https://github.com/isaacs/node-graceful-fs/issues/256): the report compares promisified callback `graceful-fs.writeFile` with `node:fs/promises.writeFile`. Native callback `node:fs.writeFile` has the same >=2 GiB single-write limitation, while the promise implementation chunks. Stackline's guarded chunking is therefore an intentional capability extension toward the promise path, not differential parity with native callback `fs`.
- [#258](https://github.com/isaacs/node-graceful-fs/issues/258): transient `EAGAIN` is not retried by queued callback operations. An injected EAGAIN was returned after one attempt in exact 4.2.11. Stackline narrows its claim to idempotent, path-owned asynchronous operations; it does not claim to fix the motivating pnpm/ZFS synchronous operations.
- [PR #259](https://github.com/isaacs/node-graceful-fs/pull/259): an unreviewed proposal adds EAGAIN handling to callback operations. Its code is not copied. Blind replay is rejected for `appendFile`, append-flag `writeFile`, and numeric-descriptor `readFile`/`writeFile` because partial side effects or descriptor-position changes can duplicate or truncate data. The motivating pnpm fix also covered synchronous ZFS operations that PR #259 does not address.
- [PR #260](https://github.com/isaacs/node-graceful-fs/pull/260): an unreviewed proposal describes retry re-entry that can exceed the call stack. The fix must schedule queue progress without weakening ordering or the 60-second bound.

An OSV exact-version query returned no entries for `graceful-fs@4.2.11` on 2026-08-29. This is not a claim that the package is vulnerability-free.

## Necessity and alternatives

Native `node:fs` is preferable where callers do not need EMFILE/ENFILE coordination, but it does not preserve the process-wide queue and close-triggered retry contract. The current `@pnpm/graceful-fs` and `@pnpm/fs.graceful-fs` packages still wrap or depend on 4.2.11. No active maintained drop-in was found.

The pre-build GO decision initially treated two distinct current direct users
as a qualified adoption path:

1. `jprichardson/node-fs-extra@11.4.0` directly imports and re-exports `graceful-fs` in [`lib/fs/index.js`](https://github.com/jprichardson/node-fs-extra/blob/53a8d1a63c8eb30573110ed0f6528975f98801f0/lib/fs/index.js). A tested npm-alias dependency PR can preserve the historical dependency key.
2. `npm/cli@12.0.2` directly depends on 4.2.11 and applies `gracefulify(require('node:fs'))` in [`lib/cli/entry.js`](https://github.com/npm/cli/blob/81a901c9a5913f9bd8104e6196af3580eafa13cb/lib/cli/entry.js). Because that is a global application patch, adoption begins with a maintainer decision issue rather than an unsolicited dependency PR.

## Adoption-path reconciliation — 2026-08-29T05:22:58Z

The pre-build decision and timestamp above remain unchanged. Subsequent policy
and defect-fit review disqualified npm/cli as the public issue target: it
remains a required global-patch compatibility suite, but no current npm/cli
defect was established that would justify opening a public Stackline adoption
issue. Its contribution policy also rejects unsolicited third-party dependency
updates. No npm/cli contact will be made.

The replacement second candidate is NodeBB at exact commit
[`75e8771fe403d5d763b1b6dea9a8718794327054`](https://github.com/NodeBB/NodeBB/commit/75e8771fe403d5d763b1b6dea9a8718794327054).
It pins `graceful-fs@4.2.11` in
[`install/package.json`](https://github.com/NodeBB/NodeBB/blob/75e8771fe403d5d763b1b6dea9a8718794327054/install/package.json#L82),
globally patches native `fs` during startup in
[`src/file.js`](https://github.com/NodeBB/NodeBB/blob/75e8771fe403d5d763b1b6dea9a8718794327054/src/file.js#L9-L15),
and creates long-lived logging streams in
[`src/logger.js`](https://github.com/NodeBB/NodeBB/blob/75e8771fe403d5d763b1b6dea9a8718794327054/src/logger.js#L77-L86).
That combination provides a concrete fit for the stream-retention and global-
patch compatibility work. NodeBB is only a final-release/test-gated candidate:
no issue is eligible unless the official registry alias, exact installed
identity/integrity/tree, repeated logger open/close resource behavior, global
patch/queue behavior, append exclusion and loader behavior all pass at the
pinned commit. Inconclusive target evidence leaves the adoption checkpoint
open; it is not permission to contact another repository.

## Compatibility and publication gates

Publication is prohibited until all of the following are green:

- deterministic regressions for #245, #248, #256, #258 and the #259/#260 failure modes;
- complete method/property/descriptor/prototype differential checks against 4.2.11 and `node:fs`;
- CommonJS `fs`-like object export, `gracefulify`, shared Symbol queue, global close hooks, streams, retry ordering/backoff/60-second timeout and Windows rename behavior;
- upstream, malformed-input, security, stress, type, packed scoped-install and historical-key npm-alias tests;
- bounded heap, handles, descriptors and queue growth;
- current npm 12, node-gyp 13, fs-extra 11 and Jest 30 downstream suites;
- actual Node 20, 22, 24 and 26 runs plus Linux and Windows hosted workflows on the exact release-candidate commit;
- one immutable artifact verified first on Verdaccio, then published once to npm and verified byte-for-byte.

If any gate cannot be proved, the decision must be replaced before publication by a durable `NO_GO` record with the precise failed compatibility reason.

## Historical rejected gate — 2026-08-29T05:30:16Z

The build is **NO-GO / REJECTED**. Two independently reproduced
data-integrity failures make the replacement unsafe to publish:

1. `usesAppendFlag` in both `graceful-fs.js` and `write-buffer.js` recognizes
   only string flags. A numeric
   `O_APPEND | O_WRONLY | O_CREAT` option is therefore treated as replay-safe.
   If an append attempt performs its side effect and then reports callback-level
   `EAGAIN`, the retry appends the same bytes again. The deterministic fake-fs
   probe returned a successful callback with `attempts=2` and `bytes="XX"`
   after the first attempt had appended `X` and reported `EAGAIN`.
2. The >=2 GiB branch enters `writeBuffer` before native `writeFile` option
   validation. `normalizeWriteOptions` coerces or discards invalid `signal`,
   `encoding`, `flush`, and non-object options, so it can open or truncate a
   target that native callback `fs.writeFile` rejects. Broad passing tests do
   not override a reproducible write-path corruption or premature-side-effect
   case. With `{ signal: "invalid" }`, native callback `fs.writeFile` threw
   `ERR_INVALID_ARG_TYPE` and left the target untouched; the injected chunk-
   branch probe opened the target and completed successfully.

Final review also found unresolved mixed-generation and evidence-contract
warnings: `resetQueue` mutates historical two-slot records that exact 4.2.11
skips; the documented “monotonic” deadline uses wall-clock `Date.now`; and the
draft hosted workflow omits the existing `audit:all` and `audit:signatures`
scripts. These are additional reconsideration work, not exceptions to the two
blocking failures above.

The independent adoption gate also failed. The tested fs-extra migration is a
qualified PR path, but a GO requires a different qualified issue target.
npm/cli was disqualified because no npm-specific defect was established and
its baseline test was later interrupted with exit 130 before migration when the
terminal blockers made further execution immaterial. NodeBB commit
`75e8771fe403d5d763b1b6dea9a8718794327054` pins 4.2.11 and its actual
`src/file` -> `src/logger` path was verified statically, but no repository-
specific retained-resource defect was reproduced. Three independent runs per
provider of the existing 2,500-stream control showed zero descriptor delta,
zero active-filesystem-resource delta, zero live `WriteStream` objects, and an
empty retry queue for native fs, exact 4.2.11, and the candidate. Lower heap
deltas alone are not a defect or fix claim.

No immutable release candidate, GitHub repository, hosted workflow, Verdaccio
or npm publication, tag, documentation deployment, pull request, issue, or
other public contact was created. The implementation is retained locally as
unpublished research. Reconsideration requires compatibility-proved handling
of numeric append flags and complete native option validation before any
side effect, plus two distinct currently qualified adoption paths including a
repository-specific issue case.

## Reconsideration — 2026-08-30

The owner made recursive production-closure maintenance mandatory after finding
that published Stackline parents still installed the stale upstream package.
The former NO_GO is superseded for this remediation after removing both
data-integrity blockers rather than waiving them:

- public callback `writeFile` no longer enters the custom >=2 GiB chunk path;
  native validation and side-effect ordering remain authoritative;
- numeric `O_APPEND` is detected and excluded from EAGAIN replay, with a
  deterministic one-attempt/one-side-effect regression;
- short mixed-generation queue records are no longer rewritten as timed
  records;
- the final package has zero runtime, optional and peer dependencies and clean
  direct plus historical-key consumer closures.

The release exists to repair `@stackline/fstream` and
`@stackline/fs-write-stream-atomic` bottom-up. Their already-published versions
are not modified; each receives a new patch release only after this leaf passes
all hosted, registry and immutable-artifact gates.
