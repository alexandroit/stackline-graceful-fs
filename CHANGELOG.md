# Changelog

## 1.0.0 - 2026-08-29

- Continue the exact ISC-licensed graceful-fs 4.2.11 contract.
- Return a mutable reset-aware clone for non-extensible fs namespaces.
- Preserve mixed-copy shared EMFILE/ENFILE array records.
- Schedule retries without synchronous re-entry and accelerate descriptor work
  after close without duplicate callbacks.
- Add a separate absolute-deadline EAGAIN queue for selected idempotent,
  path-owned asynchronous operations.
- Exclude both string and numeric `O_APPEND` flags from whole-operation EAGAIN
  replay.
- Use native stream constructors with an explicit patched `fs` implementation
  to avoid the historical wrapper retention path.
- Preserve native callback `writeFile` validation and large-buffer behavior;
  the rejected pre-validation chunking extension is not shipped.
- Preserve short historical shared-queue records without converting them into
  timed records.
- Add first-party types, provenance records, modern CI, CodeQL, packed runtime
  gates, and downstream compatibility verification.
