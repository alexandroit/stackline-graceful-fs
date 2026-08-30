# Contributing

Run the release-oriented local gate:

```sh
npm ci
npm run check
npm run test:coverage
npm run test:upstream
npm run test:packed
```

CI additionally installs the packed artifact on every supported Node line,
tests Linux, macOS and Windows, and runs the pinned downstream matrix.

Changes to retry policy require a deterministic callback-once regression,
partial-side-effect analysis, mixed 4.2.11/new-copy coverage where applicable,
and Linux/Windows CI. Changes to the public surface require a differential
descriptor test.

Keep source compatible with Node 14.14. Do not copy code from later upstream
repository revisions without first updating provenance and license accounting.
Any proposed production dependency must include a current-maintenance review,
its complete installed transitive closure, warning-free direct and alias
consumer installs, a valid `npm ls`, and zero-finding production and source
audits. A failing child blocks the parent release.
