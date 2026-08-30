# Adoption targets

State: GO / internal dependency remediation; no public contact is authorized.

The immediate verified consumers are the published Stackline parents
`@stackline/fstream@1.0.0` and
`@stackline/fs-write-stream-atomic@1.0.0`. They are updated only after this leaf
is published and verified. This owner-directed repair does not authorize an
unsolicited external PR or issue.

## Tested migration pull request: jprichardson/node-fs-extra

- Pinned baseline: `53a8d1a63c8eb30573110ed0f6528975f98801f0`
- Direct use:
  https://github.com/jprichardson/node-fs-extra/blob/53a8d1a63c8eb30573110ed0f6528975f98801f0/lib/fs/index.js
- Related resource report:
  https://github.com/jprichardson/node-fs-extra/issues/1042
- Related EAGAIN disposition:
  https://github.com/jprichardson/node-fs-extra/issues/1057
- Verified dependency form:
  `"graceful-fs": "npm:@stackline/graceful-fs@1.0.0"`
- Policy: Standard style; run lint, unit and ESM suites; cross-platform edge
  tests are valued; discuss broad changes first. There is no lockfile.
- Required evidence before opening: full `npm test`, exact `npm ls`, package
  artifact hash, no source import changes, and live duplicate search.

## Disqualified issue candidate: npm/cli

- Pinned baseline: `81a901c9a5913f9bd8104e6196af3580eafa13cb`
- Direct global patch:
  https://github.com/npm/cli/blob/81a901c9a5913f9bd8104e6196af3580eafa13cb/lib/cli/entry.js
- Dependency manifest:
  https://github.com/npm/cli/blob/81a901c9a5913f9bd8104e6196af3580eafa13cb/package.json
- Security policy: https://github.com/npm/cli/security/policy
- Contribution policy rejects third-party dependency-update PRs, and no
  npm-specific defect was established. Retain npm/cli only as a compatibility
  gate; do not open an adoption issue. The exact npm CLI 12.0.2 suite passes
  before and after replacement on Node 26.8.1 in an isolated filesystem
  namespace.

## Disqualified conditional issue candidate: NodeBB/NodeBB

- Pinned baseline: `75e8771fe403d5d763b1b6dea9a8718794327054`
- Direct pin:
  https://github.com/NodeBB/NodeBB/blob/75e8771fe403d5d763b1b6dea9a8718794327054/install/package.json#L82
- Global patch:
  https://github.com/NodeBB/NodeBB/blob/75e8771fe403d5d763b1b6dea9a8718794327054/src/file.js#L9-L15
- Logger stream path:
  https://github.com/NodeBB/NodeBB/blob/75e8771fe403d5d763b1b6dea9a8718794327054/src/logger.js#L77-L99
- Exact source review verified the path, but no NodeBB-specific retained
  descriptor, resource, stream object, or retry-queue defect was reproduced.
  The generic 2,500-stream control was neutral for native, 4.2.11, and the
  candidate. This is not a qualified maintainer-decision issue.

The old fs-extra proposal remains closed. Any future external adoption requires
fresh repository-specific qualification and explicit compliance with the
current outreach policy.
