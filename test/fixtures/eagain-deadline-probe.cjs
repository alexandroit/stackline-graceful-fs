'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

require('graceful-fs-upstream')
const stackline = require(path.resolve(__dirname, '..', '..'))
const descriptors = [
  fs.openSync(os.devNull, 'r'),
  fs.openSync(os.devNull, 'r'),
  fs.openSync(os.devNull, 'r')
]
const originalNow = Date.now
const originalSetTimeout = global.setTimeout
const originalClearTimeout = global.clearTimeout
const scheduled = []
let clock = 1000
let attempts = 0
let callbacks = 0

function cloneFs () {
  const copy = Object.create(Object.getPrototypeOf(fs))
  for (const key of Reflect.ownKeys(fs)) {
    const descriptor = Object.getOwnPropertyDescriptor(fs, key)
    descriptor.configurable = true
    if (Object.prototype.hasOwnProperty.call(descriptor, 'writable'))
      descriptor.writable = true
    Object.defineProperty(copy, key, descriptor)
  }
  copy.open = function (_path, _flags, _mode, callback) {
    attempts++
    callback(Object.assign(new Error('synthetic EAGAIN'), { code: 'EAGAIN' }))
  }
  return copy
}

async function main () {
  Date.now = () => clock
  global.setTimeout = (fn, delay) => {
    const token = { fn, delay, cancelled: false }
    scheduled.push(token)
    return token
  }
  global.clearTimeout = token => {
    if (token)
      token.cancelled = true
  }

  const patched = stackline.gracefulify(cloneFs())
  const completed = new Promise(resolve => {
    patched.open('zfs', 'r', error => {
      callbacks++
      resolve(error)
    })
  })

  for (let index = 0; index < descriptors.length; index++) {
    clock += 15000
    fs.closeSync(descriptors[index])
  }
  if (callbacks !== 0)
    throw new Error('EAGAIN completed before its original deadline')

  clock = 61001
  const timer = scheduled.find(token => !token.cancelled)
  if (!timer)
    throw new Error('missing EAGAIN timer')
  timer.fn()
  const error = await completed

  process.stdout.write(`${JSON.stringify({
    attempts,
    callbacks,
    code: error && error.code,
    sharedQueueLength: global[Symbol.for('graceful-fs.queue')].length
  })}\n`)
}

main().finally(() => {
  Date.now = originalNow
  global.setTimeout = originalSetTimeout
  global.clearTimeout = originalClearTimeout
}).catch(error => {
  console.error(error)
  process.exitCode = 1
})
