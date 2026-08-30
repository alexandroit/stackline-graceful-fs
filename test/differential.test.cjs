'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { test } = require('node:test')
const graceful = require('..')
const upstream = require('graceful-fs-upstream')

const intentionallyPatched = new Set([
  'FileReadStream', 'FileWriteStream', 'ReadStream', 'WriteStream',
  'appendFile', 'chown', 'chmod', 'chownSync', 'chmodSync',
  'copyFile', 'createReadStream', 'createWriteStream', 'fchown', 'fchmod',
  'fchownSync', 'fchmodSync', 'fstat', 'fstatSync', 'gracefulify',
  'lchown', 'lchmod', 'lchownSync', 'lchmodSync', 'lstat', 'lstatSync',
  'lutimes', 'lutimesSync', 'open', 'read', 'readFile', 'readSync',
  'readdir', 'rename', 'stat', 'statSync', 'writeFile'
])

test('complete node:fs surface is retained', () => {
  for (const key of Object.getOwnPropertyNames(fs))
    assert.ok(Object.getOwnPropertyNames(graceful).includes(key), `missing ${String(key)}`)

  for (const key of Object.getOwnPropertyNames(fs)) {
    if (intentionallyPatched.has(key))
      continue
    const nativeDescriptor = Object.getOwnPropertyDescriptor(fs, key)
    const actualDescriptor = Object.getOwnPropertyDescriptor(graceful, key)
    assert.equal(actualDescriptor.enumerable, nativeDescriptor.enumerable, `${key} enumerable`)
    assert.equal(typeof actualDescriptor.get, typeof nativeDescriptor.get, `${key} getter`)
    assert.equal(typeof actualDescriptor.value, typeof nativeDescriptor.value, `${key} value type`)
  }
})

test('4.2.11 public names and shared queue identity are retained', () => {
  assert.deepEqual(Reflect.ownKeys(graceful), Reflect.ownKeys(upstream))

  for (const key of Reflect.ownKeys(upstream)) {
    const expected = Object.getOwnPropertyDescriptor(upstream, key)
    const actual = Object.getOwnPropertyDescriptor(graceful, key)
    assert.equal(actual.enumerable, expected.enumerable, `${String(key)} enumerable`)
    assert.equal(actual.configurable, expected.configurable, `${String(key)} configurable`)
    if (Object.prototype.hasOwnProperty.call(expected, 'writable'))
      assert.equal(actual.writable, expected.writable, `${String(key)} writable`)
    assert.equal(typeof actual.get, typeof expected.get, `${String(key)} getter`)
    assert.equal(typeof actual.set, typeof expected.set, `${String(key)} setter`)
    assert.equal(typeof actual.value, typeof expected.value, `${String(key)} value type`)
  }

  const queue = Symbol.for('graceful-fs.queue')
  assert.equal(fs[queue], global[queue])
  assert.equal(graceful[queue], undefined)
  assert.equal(upstream[queue], undefined)
})

test('observable file results match 4.2.11 for ordinary operations', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'stackline-gfs-diff-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))

  const ours = path.join(directory, 'ours.txt')
  const theirs = path.join(directory, 'theirs.txt')
  await Promise.all([
    new Promise((resolve, reject) => graceful.writeFile(ours, 'same', err => err ? reject(err) : resolve())),
    new Promise((resolve, reject) => upstream.writeFile(theirs, 'same', err => err ? reject(err) : resolve()))
  ])
  assert.deepEqual(fs.readFileSync(ours), fs.readFileSync(theirs))

  const [ourStats, theirStats] = await Promise.all([
    new Promise((resolve, reject) => graceful.stat(ours, (err, value) => err ? reject(err) : resolve(value))),
    new Promise((resolve, reject) => upstream.stat(theirs, (err, value) => err ? reject(err) : resolve(value)))
  ])
  assert.equal(ourStats.size, theirStats.size)
  assert.equal(ourStats.isFile(), theirStats.isFile())
})

test('multiple loaded copies converge on one process queue', () => {
  const entry = require.resolve('..')
  delete require.cache[entry]
  const second = require('..')
  assert.notEqual(second, graceful)
  assert.equal(second[Symbol.for('graceful-fs.queue')], graceful[Symbol.for('graceful-fs.queue')])
})

test('patched closeSync arity retains the historical contract', () => {
  assert.equal(graceful.closeSync.length, upstream.closeSync.length)
  assert.equal(graceful.closeSync.length, 1)
})

test('a pre-imported ESM namespace receives reset-aware close hooks only on its clone', () => {
  const fixture = path.join(__dirname, 'fixtures', 'esm-close-probe.cjs')
  const child = spawnSync(process.execPath, [fixture], {
    encoding: 'utf8',
    timeout: 30000
  })
  assert.equal(child.status, 0, child.stderr || child.stdout)
  const result = JSON.parse(child.stdout.trim())
  assert.equal(result.sourceMutated, false)
  assert.equal(result.cloneMarked, true)
  assert.equal(result.callbackCount, 1)
  assert.equal(result.queueLength, 0)
})

test('#245 loader conversion succeeds while exact 4.2.11 reproduces the namespace failure', () => {
  const fixture = path.join(__dirname, 'fixtures', 'esm-loader-probe.cjs')
  const actual = spawnSync(process.execPath, [fixture, path.resolve(__dirname, '..')], {
    encoding: 'utf8',
    timeout: 30000
  })
  assert.equal(actual.status, 0, actual.stderr || actual.stdout)
  const result = JSON.parse(actual.stdout.trim())
  assert.equal(result.extensible, false)
  assert.equal(result.queuePublished, true)

  const baseline = spawnSync(process.execPath, [fixture, path.dirname(require.resolve('graceful-fs-upstream'))], {
    encoding: 'utf8',
    timeout: 30000
  })
  assert.notEqual(baseline.status, 0)
  assert.match(baseline.stderr, /TypeError|not extensible|Cannot define property/)
})

test('4.2.11 and Stackline copies safely consume each other\'s historical array records', () => {
  const fixture = path.join(__dirname, 'fixtures', 'mixed-copy-probe.cjs')
  const child = spawnSync(process.execPath, [fixture], {
    encoding: 'utf8',
    timeout: 30000
  })
  assert.equal(child.status, 0, child.stderr || child.stdout)
  const result = JSON.parse(child.stdout.trim())
  assert.deepEqual(result.descriptors, [41, 40])
  assert.equal(result.oldAttempts, 2)
  assert.equal(result.newAttempts, 2)
  assert.equal(result.queueLength, 0)
  assert.equal(result.historicalCloseOwner, true)
})
