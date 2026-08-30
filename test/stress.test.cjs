'use strict'

const assert = require('node:assert/strict')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { test } = require('node:test')
const graceful = require('..')
const { callbackResult, cloneFs, errorWithCode } = require('./helpers.cjs')

test('retry queue preserves FIFO completion under transient descriptor pressure', async () => {
  const seen = new Map()
  const fake = cloneFs({
    open: function (name, _flags, _mode, callback) {
      const count = (seen.get(name) || 0) + 1
      seen.set(name, count)
      if (count === 1)
        return callback(errorWithCode('EMFILE'))
      callback(null, Number(name.slice(1)))
    }
  })
  const patched = graceful.gracefulify(fake)
  const completion = []
  const jobs = []

  for (let index = 0; index < 500; index++) {
    jobs.push(callbackResult(cb => patched.open(`f${index}`, 'r', (err, fd) => {
      completion.push(fd)
      cb(err, fd)
    })))
  }

  await Promise.all(jobs)
  assert.deepEqual(completion, Array.from({ length: 500 }, (_, index) => index))
  assert.equal(global[Symbol.for('graceful-fs.queue')].length, 0)
})

test('60-second overall retry timeout returns the original error exactly once', async () => {
  const originalNow = Date.now
  const originalSetTimeout = global.setTimeout
  const originalClearTimeout = global.clearTimeout
  const scheduled = []
  let clock = 1000
  let callbacks = 0

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

  try {
    const originalError = errorWithCode('ENFILE')
    const fake = cloneFs({
      open: function (_path, _flags, _mode, callback) {
        callback(originalError)
      }
    })
    const patched = graceful.gracefulify(fake)
    const result = new Promise(resolve => {
      patched.open('never', 'r', err => {
        callbacks++
        resolve(err)
      })
    })

    assert.equal(scheduled.length, 1)
    clock = 61001
    scheduled.shift().fn()
    assert.equal(await result, originalError)
    assert.equal(callbacks, 1)
    assert.equal(global[Symbol.for('graceful-fs.queue')].length, 0)
  } finally {
    Date.now = originalNow
    global.setTimeout = originalSetTimeout
    global.clearTimeout = originalClearTimeout
  }
})

test('EAGAIN backoff drains cleanly and does not poison subsequent retries', () => {
  const fixture = path.join(__dirname, 'fixtures', 'eagain-backoff-probe.cjs')
  const child = spawnSync(process.execPath, [fixture], {
    encoding: 'utf8',
    timeout: 30000
  })
  assert.equal(child.status, 0, child.stderr || child.stdout)
  const result = JSON.parse(child.stdout.trim())
  assert.ok(result.positiveDelay >= 1)
  assert.equal(result.firstAttempts, 2)
  assert.equal(result.secondAttempts, 2)
  assert.equal(result.callbacks, 2)
})

test('4.2.11-owned close resets cannot extend the local EAGAIN deadline', () => {
  const fixture = path.join(__dirname, 'fixtures', 'eagain-deadline-probe.cjs')
  const child = spawnSync(process.execPath, [fixture], {
    encoding: 'utf8',
    timeout: 30000
  })
  assert.equal(child.status, 0, child.stderr || child.stdout)
  const result = JSON.parse(child.stdout.trim())
  assert.equal(result.attempts, 1)
  assert.equal(result.callbacks, 1)
  assert.equal(result.code, 'EAGAIN')
  assert.equal(result.sharedQueueLength, 0)
})

test('successful close cancels delayed descriptor retry and preserves FIFO callback-once order', async () => {
  const fs = require('node:fs')
  const os = require('node:os')
  const fd = fs.openSync(os.devNull, 'r')
  const originalNow = Date.now
  const originalSetTimeout = global.setTimeout
  const originalClearTimeout = global.clearTimeout
  const scheduled = []
  let clock = 1000
  let release = false
  const attempts = new Map()
  const callbacks = new Map()
  const completion = []

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

  function nextTimer () {
    const token = scheduled.find(candidate => !candidate.cancelled && !candidate.ran)
    assert.ok(token, 'expected a live retry timer')
    token.ran = true
    clock += token.delay
    token.fn()
    return token
  }

  try {
    const fake = cloneFs({
      open: function (name, _flags, _mode, callback) {
        attempts.set(name, (attempts.get(name) || 0) + 1)
        callback(release ? null : errorWithCode('EMFILE'), Number(name.slice(1)))
      }
    })
    const patched = graceful.gracefulify(fake)
    const jobs = ['f1', 'f2'].map(name => callbackResult(cb => {
      patched.open(name, 'r', (error, result) => {
        callbacks.set(name, (callbacks.get(name) || 0) + 1)
        completion.push(result)
        cb(error, result)
      })
    }))

    nextTimer()
    const delayed = scheduled.find(token => !token.cancelled && !token.ran)
    assert.ok(delayed.delay > 0)

    graceful.closeSync(fd)
    assert.equal(delayed.cancelled, true)
    const accelerated = scheduled.find(token => !token.cancelled && !token.ran)
    assert.equal(accelerated.delay, 0)

    release = true
    while (completion.length < 2)
      nextTimer()
    assert.deepEqual(await Promise.all(jobs), [1, 2])
    assert.deepEqual(completion, [1, 2])
    assert.deepEqual(Object.fromEntries(callbacks), { f1: 1, f2: 1 })
    assert.equal(global[Symbol.for('graceful-fs.queue')].length, 0)
  } finally {
    Date.now = originalNow
    global.setTimeout = originalSetTimeout
    global.clearTimeout = originalClearTimeout
  }
})
