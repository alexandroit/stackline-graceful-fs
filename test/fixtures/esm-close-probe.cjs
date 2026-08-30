'use strict'

const os = require('node:os')
const path = require('node:path')

async function main () {
  const namespace = await import('node:fs')
  const originalClose = namespace.close
  const originalCloseSync = namespace.closeSync
  const graceful = require(path.resolve(__dirname, '..', '..'))
  const patched = graceful.gracefulify(namespace)
  const previous = Symbol.for('graceful-fs.previous')
  const queue = global[Symbol.for('graceful-fs.queue')]
  const fd = namespace.openSync(os.devNull, 'r')
  let callbackCount = 0

  const completed = new Promise(resolve => {
    function queuedOperation (callback) {
      callbackCount++
      callback(null, 99)
    }
    queue.push([
      queuedOperation,
      [resolve],
      Object.assign(new Error('synthetic EMFILE'), { code: 'EMFILE' }),
      Date.now() - 1000,
      Date.now() - 1000
    ])
  })

  patched.closeSync(fd)
  await completed

  process.stdout.write(`${JSON.stringify({
    sourceMutated: namespace.close !== originalClose || namespace.closeSync !== originalCloseSync,
    cloneMarked: patched.close[previous] === originalClose && patched.closeSync[previous] === originalCloseSync,
    callbackCount,
    queueLength: queue.length
  })}\n`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
