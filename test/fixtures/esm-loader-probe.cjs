'use strict'

const Module = require('node:module')
const path = require('node:path')

async function main () {
  const namespace = await import('node:fs')
  const ownKeys = Reflect.ownKeys(namespace)
  const originalLoad = Module._load
  let provider
  try {
    Module._load = function (request, parent, isMain) {
      if (request === 'fs')
        return namespace
      return originalLoad.call(this, request, parent, isMain)
    }
    provider = require(path.resolve(process.argv[2]))
  } finally {
    Module._load = originalLoad
  }

  if (Object.isExtensible(namespace))
    throw new Error('source namespace became extensible')
  if (Reflect.ownKeys(namespace).length !== ownKeys.length)
    throw new Error('source namespace surface changed')
  if (typeof provider.readFile !== 'function' || typeof provider.gracefulify !== 'function')
    throw new Error('patched export is incomplete')

  process.stdout.write(`${JSON.stringify({
    extensible: Object.isExtensible(namespace),
    sourceKeys: ownKeys.length,
    exportKeys: Reflect.ownKeys(provider).length,
    queuePublished: Array.isArray(global[Symbol.for('graceful-fs.queue')])
  })}\n`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
