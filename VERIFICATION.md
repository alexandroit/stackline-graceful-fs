# Verification log

## Current local evidence

- Decision: GO / BUILDING under recursive dependency remediation.
- Maintained suite: 34/34 tests pass on Node 20.20.2.
- Numeric `O_APPEND` regression proves one side effect and one callback attempt.
- The unsafe public >=2 GiB branch is removed; native callback behavior remains.
- Direct and historical-key local tarball installs complete without npm warnings.
- Installed production trees contain only `@stackline/graceful-fs@1.0.0`.
- Production and complete source audits report zero vulnerabilities.
- Runtime, optional and peer dependency counts are zero.
- Lint, TypeScript, `publint`, Are the Types Wrong, license, release metadata,
  CycloneDX model, reproducible-pack and registry-signature gates pass.
- Two independently generated packs are byte-identical.
- The exact upstream 4.2.11 suite passes 49,434/49,434 assertions in normal and
  global-patch modes.
- Coverage passes at 97.78% lines/statements, 87.50% branches and 92.30%
  functions.
- Pinned `fs-extra@11.4.0`, `node-gyp@13.0.2`, Jest 30.5.0 and npm CLI 12.0.2
  compatibility checks pass against the exact packed artifact. The npm CLI
  baseline and migrated suites each pass 5,830 assertions on Node 26.8.1 in an
  isolated filesystem namespace.
- The final local tarball is 17,917 bytes with SHA-256
  `d7d849be974dd160567df577e260a49fc1013a73ab329b7f530fdff317788c34`.

## Remaining release evidence

- supported Node matrix and hosted Linux/Windows CI;
- CodeQL on the exact release-candidate commit;
- exact-byte Verdaccio direct and npm-alias installs;
- official npm, immutable tag/release and Alexandro.Net verification.

The 2026-08-29 NO_GO and its evidence remain preserved in
`UPSTREAM_AUDIT.md`; it was superseded only after both data-integrity blockers
were removed and the owner explicitly required this leaf remediation.
