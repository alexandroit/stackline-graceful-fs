import fs = require('fs')

declare const gracefulFs: typeof fs & {
  /**
   * Patch an extensible fs-like object in place. For a non-extensible ESM
   * namespace, returns a mutable patched clone and leaves the input unchanged.
   */
  gracefulify<T extends typeof fs>(target: T): T & typeof gracefulFs
}

export = gracefulFs
