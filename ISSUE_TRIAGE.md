# Issue triage

Include Node version, operating system, filesystem type, whether global
patching is enabled, and a minimal reproduction.

For retry reports, identify:

- the exact operation and error code;
- whether a path or numeric descriptor was supplied;
- flags, especially append flags;
- whether an earlier attempt may have partially changed data or descriptor
  position;
- callback count and timing;
- queue length, active handles and open descriptor observations.

Security-sensitive reports belong in a private advisory, not a public issue.
