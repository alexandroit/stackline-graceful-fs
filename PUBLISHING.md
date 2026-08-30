# Publishing

Publication uses one immutable tarball. Do not run `npm publish .`.

`prepack` is intentionally pack-free and checks only the source/package
contract. A successful `npm pack` or `prepack` is never publication approval.
Official publication remains blocked until every local, hosted, registry and
identity gate below is recorded in `VERIFICATION.md`.

1. Complete lint, 34-case unit/differential/malformed/security/stress/memory,
   type, coverage, license, SBOM, reproducible-pack, package-quality, zero-
   vulnerability and registry-signature gates.
2. Complete the exact 4.2.11 upstream suite in normal and global-patch modes,
   all supported packed CJS/ESM runtimes, and pinned
   fs-extra, node-gyp, Jest and npm CLI baseline/migration suites.
3. Push an untagged release-candidate commit. This commit can exist before
   hosted evidence; no publishable artifact may exist yet.
4. Wait for required Linux, macOS and Windows correctness, full upstream, exact
   Node 14.14–26 packed CJS/ESM, downstream and CodeQL workflows
   on that exact commit.
5. From a clean checkout of that exact commit with npm 10.8.2, set
   `STACKLINE_GREEN_COMMIT` to the full HEAD and run `npm run artifact:prepare`
   once. Record SHA-1/SHA-256/SHA-512, integrity, inventory and SBOM.
6. Publish those exact bytes to a temporary Verdaccio registry and verify a
   clean scoped install plus a real registry-backed historical-key npm alias.
7. Authenticate as `alex360qc`, retry registry preflight after any network
   failure, verify the package name is still free, and publish the same tarball
   once with explicit `--access public`. A failed read is not evidence that the
   name is free. This release uses an authenticated local CLI identity, so it
   does not request unsupported hosted build provenance.
8. Download the registry tarball and compare exact bytes before creating the
   git tag and GitHub release.
9. Wait for tag workflows, then update Alexandro.Net from the verified tag.

If any byte, identity, provenance, workflow or runtime check differs, stop.
