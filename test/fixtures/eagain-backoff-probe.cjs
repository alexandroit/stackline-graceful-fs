'use strict'

const fs = require('node:fs')
const path = require('node:path')
const graceful = require(path.resolve(__dirname, '..', '..'))
const originalNow = Date.now
const originalSetTimeout = global.setTimeout
const originalClearTimeout = global.clearTimeout
const scheduled = []
let clock = 5000
let release = false
let firstAttempts = 0
let secondAttempts = 0
let callbacks = 0

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

function eagain () {
  return Object.assign(new Error('synthetic EAGAIN'), { code: 'EAGAIN' })
}

async function main () {
  Date.now = () => clock
  global.setTimeout = (fn, delay) => {
    const token = { fn, delay, cancelled: false, ran: false }
    scheduled.push(token)
    return token
  }
  global.clearTimeout = token => {
    if (token)
      token.cancelled = true
  }

  const first = graceful.gracefulify(cloneFs(function (_path, _flags, _mode, callback) {
    firstAttempts++
    callback(release ? null : eagain(), 11)
  }))
  const firstDone = new Promise((resolve, reject) => {
    first.open('first', 'r', (error, fd) => {
      callbacks++
      error ? reject(error) : resolve(fd)
    })
  })

  const initial = scheduled.find(token => !token.cancelled && !token.ran)
  initial.ran = true
  initial.fn()
  const delayed = scheduled.find(token => !token.cancelled && !token.ran)
  const positiveDelay = delayed.delay
  release = true
  delayed.ran = true
  clock += delayed.delay
  delayed.fn()
  await firstDone

  Date.now = originalNow
  global.setTimeout = originalSetTimeout
  global.clearTimeout = originalClearTimeout

  const second = graceful.gracefulify(cloneFs(function (_path, _flags, _mode, callback) {
    secondAttempts++
    callback(secondAttempts === 1 ? eagain() : null, 12)
  }))
  await new Promise((resolve, reject) => {
    second.open('second', 'r', (error, fd) => {
      callbacks++
      error ? reject(error) : resolve(fd)
    })
  })

  process.stdout.write(`${JSON.stringify({
    positiveDelay,
    firstAttempts,
    secondAttempts,
    callbacks
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
