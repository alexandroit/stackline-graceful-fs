# Migration

## Historical-key npm alias

Most consumers can migrate without changing imports:

```json
{
  "dependencies": {
    "graceful-fs": "npm:@stackline/graceful-fs@^1.0.0"
  }
}
```

Regenerate the package-manager lockfile and run the consumer's complete test
suite. Confirm with `npm ls graceful-fs @stackline/graceful-fs` that only the
intended edge changed.

## Scoped import

Applications can instead change the import:

```js
const fs = require('@stackline/graceful-fs')
```

## ESM namespace patching

Always use the return value:

```js
import * as fsNamespace from 'node:fs'
import gracefulFs from '@stackline/graceful-fs'

const fs = gracefulFs.gracefulify(fsNamespace)
```

The namespace remains non-extensible and unchanged. The returned object is a
mutable patched clone.

## Review before migrating

Do not migrate blindly if the application:

- relies on EAGAIN replay for append operations or caller-owned numeric fds;
- depends on Node older than 14.14;
- inspects undocumented function identity instead of behavior;
- loads several graceful-fs generations and manipulates the shared queue
  directly.
