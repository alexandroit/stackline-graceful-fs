'use strict'

const fs = require('node:fs')
const path = require('node:path')

const upstream = require('graceful-fs-upstream')
const stackline = require(path.resolve(__dirname, '..', '..'))

function cloneFs (open) {
  const copy = Object.create(Object.getPrototypeOf(fs))
  for (const key of Reflect.ownKeys(fs)) {
    const descriptor = Object.getOwnPropertyDescriptor(fs, key)
    descriptor.configurable = true
    if (Object.prototype.hasOwnProperty.call(descriptor, 'writable'))
      descriptor.writable = true
    Object.defineProperty(copy, key, descriptor)
  }
  copy.open = open
  return copy
}

function transient (code) {
  return Object.assign(new Error(code), { code })
}

let oldAttempts = 0
let newAttempts = 0
const oldFs = upstream.gracefulify(cloneFs(function (_path, _flags, _mode, callback) {
  oldAttempts++
  callback(oldAttempts === 1 ? transient('EMFILE') : null, 40)
}))
const newFs = stackline.gracefulify(cloneFs(function (_path, _flags, _mode, callback) {
  newAttempts++
  callback(newAttempts === 1 ? transient('EMFILE') : null, 41)
}))

function open (provider, name) {
  return new Promise((resolve, reject) => {
    provider.open(name, 'r', (error, fd) => error ? reject(error) : resolve(fd))
  })
}

async function main () {
  const newPending = open(newFs, 'new')
  const queue = global[Symbol.for('graceful-fs.queue')]
  if (!queue.every(entry => Array.isArray(entry) && entry.length === 5))
    throw new Error('new copy emitted a non-historical queue record')

  const oldPending = open(oldFs, 'old')
  if (!queue.every(entry => Array.isArray(entry) && entry.length === 5))
    throw new Error('mixed queue contains a non-historical record')

  const descriptors = await Promise.all([newPending, oldPending])
  process.stdout.write(`${JSON.stringify({
    descriptors,
    oldAttempts,
    newAttempts,
    queueLength: queue.length,
    historicalCloseOwner: !!fs.close[Symbol.for('graceful-fs.previous')]
  })}\n`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
