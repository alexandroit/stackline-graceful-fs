'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test } = require('node:test')
const graceful = require('..')
const { callbackResult } = require('./helpers.cjs')

test('CommonJS root preserves the fs object contract', () => {
  assert.equal(typeof graceful, 'object')
  assert.equal(typeof graceful.gracefulify, 'function')
  assert.equal(typeof graceful.readFile, 'function')
  assert.equal(typeof graceful.promises.readFile, 'function')
  assert.equal(Object.getPrototypeOf(graceful), Object.getPrototypeOf(fs))
})

test('basic callback, descriptor and stream operations match graceful-fs behavior', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'stackline-gfs-upstream-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))

  const first = path.join(directory, 'b.txt')
  const second = path.join(directory, 'a.txt')
  const copy = path.join(directory, 'copy.txt')

  await callbackResult(cb => graceful.writeFile(first, 'one', cb))
  await callbackResult(cb => graceful.appendFile(first, '-two', cb))
  await callbackResult(cb => graceful.writeFile(second, 'alpha', cb))
  assert.equal(await callbackResult(cb => graceful.readFile(first, 'utf8', cb)), 'one-two')
  await callbackResult(cb => graceful.copyFile(first, copy, cb))
  assert.equal(await graceful.promises.readFile(copy, 'utf8'), 'one-two')

  const listing = await callbackResult(cb => graceful.readdir(directory, cb))
  assert.deepEqual(listing, ['a.txt', 'b.txt', 'copy.txt'])

  const fd = await callbackResult(cb => graceful.open(first, 'r', cb))
  await callbackResult(cb => graceful.close(fd, cb))

  const streamTarget = path.join(directory, 'stream.txt')
  await new Promise((resolve, reject) => {
    const stream = graceful.createWriteStream(streamTarget)
    stream.once('error', reject)
    stream.end('stream-data', resolve)
  })
  assert.equal(fs.readFileSync(streamTarget, 'utf8'), 'stream-data')

  const streamed = await new Promise((resolve, reject) => {
    let data = ''
    const stream = graceful.createReadStream(streamTarget, { encoding: 'utf8' })
    stream.once('error', reject)
    stream.on('data', chunk => { data += chunk })
    stream.once('end', () => resolve(data))
  })
  assert.equal(streamed, 'stream-data')
})

test('shared queue remains published under the historical global symbol', () => {
  const queueSymbol = Symbol.for('graceful-fs.queue')
  assert.ok(Array.isArray(global[queueSymbol]))
  assert.equal(fs[queueSymbol], global[queueSymbol])
  assert.equal(graceful[queueSymbol], undefined)
})
