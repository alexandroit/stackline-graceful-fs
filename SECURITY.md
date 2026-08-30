# Security policy

Supported security fixes are released from the latest `1.x` line.

Report suspected vulnerabilities privately through GitHub's security advisory
form:

https://github.com/alexandroit/stackline-graceful-fs/security/advisories/new

Include affected versions, Node/OS versions, a minimal reproduction, and the
observed impact. Do not open a public issue for an unpatched vulnerability.

Retrying filesystem operations is inherently sensitive to partial side
effects. Reports involving append operations, numeric descriptors, symlinks,
permissions, TOCTOU behavior, or process-wide queue interference are especially
useful.
