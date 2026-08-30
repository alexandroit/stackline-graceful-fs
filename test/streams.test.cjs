'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test } = require('node:test')
const graceful = require('..')

function finish (stream, data) {
  return new Promise((resolve, reject) => {
    stream.once('error', reject)
    stream.once('close', resolve)
    stream.end(data)
  })
}

test('inherited and non-enumerable fd options retain native lookup semantics', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'stackline-gfs-options-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))

  const inheritedTarget = path.join(directory, 'inherited.txt')
  const inheritedFd = fs.openSync(inheritedTarget, 'w')
  const inherited = Object.create({ fd: inheritedFd, autoClose: true })
  await finish(graceful.createWriteStream('ignored-inherited', inherited), 'inherited')
  assert.equal(fs.readFileSync(inheritedTarget, 'utf8'), 'inherited')

  const nativeHiddenTarget = path.join(directory, 'native-hidden-fd.txt')
  const nativePathTarget = path.join(directory, 'native-path.txt')
  const nativeHiddenFd = fs.openSync(nativeHiddenTarget, 'w')
  const nativeHidden = {}
  Object.defineProperties(nativeHidden, {
    fd: { value: nativeHiddenFd, enumerable: false },
    autoClose: { value: true, enumerable: false }
  })
  await finish(fs.createWriteStream(nativePathTarget, nativeHidden), 'native-hidden')
  fs.closeSync(nativeHiddenFd)

  const stacklineHiddenTarget = path.join(directory, 'stackline-hidden-fd.txt')
  const stacklinePathTarget = path.join(directory, 'stackline-path.txt')
  const stacklineHiddenFd = fs.openSync(stacklineHiddenTarget, 'w')
  const stacklineHidden = {}
  Object.defineProperties(stacklineHidden, {
    fd: { value: stacklineHiddenFd, enumerable: false },
    autoClose: { value: true, enumerable: false }
  })
  await finish(graceful.createWriteStream(stacklinePathTarget, stacklineHidden), 'stackline-hidden')
  fs.closeSync(stacklineHiddenFd)

  assert.equal(fs.readFileSync(nativeHiddenTarget, 'utf8'), '')
  assert.equal(fs.readFileSync(stacklineHiddenTarget, 'utf8'), '')
  assert.equal(fs.readFileSync(nativePathTarget, 'utf8'), 'native-hidden')
  assert.equal(fs.readFileSync(stacklinePathTarget, 'utf8'), 'stackline-hidden')
})

test('inherited flags and mode are observed without mutating the caller', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'stackline-gfs-flags-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const target = path.join(directory, 'append.txt')
  fs.writeFileSync(target, 'before-')
  const options = Object.create({ flags: 'a', mode: 0o600 })
  await finish(graceful.createWriteStream(target, options), 'after')
  assert.equal(fs.readFileSync(target, 'utf8'), 'before-after')
  assert.equal(Object.prototype.hasOwnProperty.call(options, 'fs'), false)
})

test('an inherited custom fs implementation is preserved exactly', async () => {
  const counts = { open: 0, write: 0, close: 0 }
  let nextFd = 700
  const customFs = {
    open: function (_path, _flags, _mode, callback) {
      counts.open++
      callback(null, nextFd++)
    },
    write: function (_fd, _buffer, _offset, length, _position, callback) {
      counts.write++
      callback(null, length)
    },
    close: function (_fd, callback) {
      counts.close++
      callback(null)
    }
  }
  const options = Object.create({ fs: customFs })
  await finish(graceful.createWriteStream('virtual', options), Buffer.from('custom'))
  assert.deepEqual(counts, { open: 1, write: 1, close: 1 })
  assert.equal(options.fs, customFs)
})
