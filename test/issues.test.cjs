'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test } = require('node:test')
const graceful = require('..')
const { callbackResult, cloneFs, errorWithCode } = require('./helpers.cjs')

test('#245: a non-extensible ESM fs namespace returns a patched mutable clone', async () => {
  const namespace = await import('node:fs')
  assert.equal(Object.isExtensible(namespace), false)

  const patched = graceful.gracefulify(namespace)
  assert.notEqual(patched, namespace)
  assert.equal(Object.isExtensible(patched), true)
  assert.equal(typeof patched.gracefulify, 'function')
  assert.equal(patched[Symbol.for('graceful-fs.queue')], undefined)
  assert.ok(Array.isArray(global[Symbol.for('graceful-fs.queue')]))
  assert.equal(typeof patched.createWriteStream, 'function')
})

test('#258/#259: safe callback operations retry transient EAGAIN asynchronously', async () => {
  const specifications = [
    ['readFile', ['file', null], Buffer.from('ok')],
    ['writeFile', ['file', Buffer.from('ok'), null], undefined],
    ['copyFile', ['source', 'target', 0], undefined],
    ['readdir', ['directory', null], ['z', 'a']],
    ['open', ['file', 'r', null], 42]
  ]

  for (const [name, args, result] of specifications) {
    let attempts = 0
    const fake = cloneFs({
      [name]: function () {
        attempts++
        const callback = arguments[arguments.length - 1]
        if (attempts < 3)
          return callback(errorWithCode('EAGAIN'))
        callback(null, result)
      }
    })
    const patched = graceful.gracefulify(fake)
    let returned = false
    const completed = callbackResult(cb => {
      patched[name](...args, cb)
      returned = true
    })
    assert.equal(returned, true, `${name} returned before retry completion`)
    const value = await completed
    assert.equal(attempts, 3, `${name} attempt count`)
    if (name === 'readdir')
      assert.deepEqual(value, ['a', 'z'])
    else
      assert.deepEqual(value, result)
  }
})

test('#259 safety: append and append-flag writes are not blindly replayed after EAGAIN', async () => {
  for (const [name, args] of [
    ['appendFile', ['file', 'data', null]],
    ['writeFile', ['file', 'data', { flag: 'a' }]]
  ]) {
    let attempts = 0
    const fake = cloneFs({
      [name]: function () {
        attempts++
        const callback = arguments[arguments.length - 1]
        callback(errorWithCode('EAGAIN'))
      }
    })
    const patched = graceful.gracefulify(fake)
    await assert.rejects(callbackResult(cb => patched[name](...args, cb)), { code: 'EAGAIN' })
    assert.equal(attempts, 1)
  }
})

test('#259 safety: numeric O_APPEND writes are not replayed after a partial side effect', async () => {
  let attempts = 0
  let bytes = ''
  const fake = cloneFs({
    writeFile: function (_path, data, _options, callback) {
      attempts++
      bytes += String(data)
      callback(errorWithCode('EAGAIN'))
    }
  })
  const patched = graceful.gracefulify(fake)
  const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_APPEND

  await assert.rejects(
    callbackResult(cb => patched.writeFile('append.log', 'X', { flag: flags }, cb)),
    { code: 'EAGAIN' }
  )
  assert.equal(attempts, 1)
  assert.equal(bytes, 'X')
})

test('#259 safety: caller-owned numeric descriptors are not replayed after partial EAGAIN', async () => {
  for (const [name, args] of [
    ['readFile', [72, null]],
    ['writeFile', [73, Buffer.from('payload'), null]]
  ]) {
    let attempts = 0
    let simulatedPosition = 0
    const fake = cloneFs({
      [name]: function () {
        attempts++
        simulatedPosition += 3
        const callback = arguments[arguments.length - 1]
        callback(errorWithCode('EAGAIN'))
      }
    })
    const patched = graceful.gracefulify(fake)
    await assert.rejects(callbackResult(cb => patched[name](...args, cb)), { code: 'EAGAIN' })
    assert.equal(attempts, 1)
    assert.equal(simulatedPosition, 3)
  }
})

test('#260: a synchronous EAGAIN storm never re-enters the underlying operation', async () => {
  let release = false
  let active = 0
  let maximumDepth = 0
  let attempts = 0

  const fake = cloneFs({
    open: function (_path, _flags, _mode, callback) {
      active++
      maximumDepth = Math.max(maximumDepth, active)
      attempts++
      if (release)
        callback(null, 100 + attempts)
      else
        callback(errorWithCode('EAGAIN'))
      active--
    }
  })
  const patched = graceful.gracefulify(fake)
  const pending = []

  for (let index = 0; index < 2000; index++)
    pending.push(callbackResult(cb => patched.open(`file-${index}`, 'r', cb)))

  assert.equal(attempts, 2000)
  assert.equal(maximumDepth, 1)
  release = true

  const descriptors = await Promise.all(pending)
  assert.equal(descriptors.length, 2000)
  assert.equal(maximumDepth, 1)
  assert.equal(global[Symbol.for('graceful-fs.queue')].length, 0)
})

test('#256 timing: a pre-aborted public write delegates native validation and callback fields', () => {
  const controller = new AbortController()
  const reason = new Error('stop now')
  controller.abort(reason)
  const data = Buffer.alloc(16)
  const nativeController = new AbortController()
  nativeController.abort(reason)
  let nativeSynchronous = true
  let nativeOutcome
  fs.writeFile(os.devNull, Buffer.alloc(1), { signal: nativeController.signal }, error => {
    nativeOutcome = {
      synchronous: nativeSynchronous,
      name: error.name,
      code: error.code,
      cause: error.cause
    }
  })
  nativeSynchronous = false

  let stacklineSynchronous = true
  let stacklineOutcome
  graceful.writeFile(os.devNull, data, { signal: controller.signal }, error => {
    stacklineOutcome = {
      synchronous: stacklineSynchronous,
      name: error.name,
      code: error.code,
      cause: error.cause
    }
  })
  stacklineSynchronous = false
  assert.deepEqual(stacklineOutcome, nativeOutcome)
})

test('#256 type safety: a forged byteLength object follows native rejection without touching the file', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'stackline-gfs-forged-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const forged = { byteLength: 0x80000000 }
  const nativeTarget = path.join(directory, 'native.txt')
  const stacklineTarget = path.join(directory, 'stackline.txt')
  fs.writeFileSync(nativeTarget, 'preserve')
  fs.writeFileSync(stacklineTarget, 'preserve')

  function observe (provider, target) {
    return new Promise(resolve => {
      let synchronous = true
      try {
        provider.writeFile(target, forged, error => {
          resolve({ kind: 'callback', synchronous, name: error && error.name, code: error && error.code })
        })
      } catch (error) {
        resolve({ kind: 'throw', synchronous, name: error.name, code: error.code })
      }
      synchronous = false
    })
  }

  const nativeOutcome = await observe(fs, nativeTarget)
  const stacklineOutcome = await observe(graceful, stacklineTarget)
  assert.deepEqual(stacklineOutcome, nativeOutcome)
  assert.equal(fs.readFileSync(nativeTarget, 'utf8'), 'preserve')
  assert.equal(fs.readFileSync(stacklineTarget, 'utf8'), 'preserve')
})

test('#248: stream wrappers use native stream prototypes and explicit fs delegation', () => {
  const stream = graceful.createWriteStream(process.platform === 'win32' ? 'NUL' : '/dev/null')
  assert.equal(Object.getPrototypeOf(stream), fs.WriteStream.prototype)
  assert.ok(stream instanceof fs.WriteStream)
  stream.destroy()
})
