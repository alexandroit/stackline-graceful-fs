# Dependency decisions

## Runtime

There are no runtime, optional, or peer dependencies. This preserves the
4.2.11 topology and keeps the process-wide filesystem primitive auditable.

## Development

- `graceful-fs-upstream` is an npm alias pinned to 4.2.11 for differential
  tests only.
- ESLint, c8, TypeScript, publint and Are the Types Wrong are verification
  tools and are excluded from the package artifact.

The release gate audits runtime dependencies separately and also records the
complete development audit.

## Future production edges

The release unit is this package plus the complete installed production
closure. A deprecated, abandoned, unsupported, vulnerable, invalid or
unreviewed child blocks publication. Remediation proceeds from the deepest
leaf upward; no parent can ship before the child is maintained, replaced or
removed and the resulting packed consumer installs without warnings.
