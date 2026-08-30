'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const graceful = require('..')
const clone = require('../clone.js')
const { callbackResult, cloneFs, errorWithCode } = require('./helpers.cjs')

test('clone treats __proto__ as data and does not pollute Object.prototype', () => {
  const source = Object.create(null)
  Object.defineProperty(source, '__proto__', {
    value: { polluted: true },
    enumerable: true,
    configurable: false,
    writable: false
  })
  const result = clone(source, true)
  assert.equal(Object.prototype.polluted, undefined)
  assert.deepEqual(result.__proto__, { polluted: true })
  assert.equal(Object.getOwnPropertyDescriptor(result, '__proto__').configurable, true)
})

test('public clone deep import retains 4.2.11 arity and callable passthrough', () => {
  function callable () { return 'callable' }
  assert.equal(clone.length, 1)
  assert.equal(clone(callable), callable)
  assert.equal(clone(callable)(), 'callable')
})

test('stream options cannot use __proto__ to change the options prototype', async () => {
  const options = JSON.parse('{"__proto__":{"polluted":true}}')
  options.fd = await new Promise((resolve, reject) => {
    fs.open(process.platform === 'win32' ? 'NUL' : '/dev/null', 'w', (err, fd) => err ? reject(err) : resolve(fd))
  })
  options.autoClose = true
  const stream = graceful.createWriteStream('ignored', options)
  assert.equal(Object.prototype.polluted, undefined)
  stream.end('safe')
  await new Promise((resolve, reject) => {
    stream.once('close', resolve)
    stream.once('error', reject)
  })
})

test('callbacks are delivered once and original non-retryable errors survive', async () => {
  let callbackCount = 0
  const expected = errorWithCode('EACCES')
  const fake = cloneFs({
    readFile: function (_path, _options, callback) {
      callback(expected)
    }
  })
  const patched = graceful.gracefulify(fake)
  await assert.rejects(callbackResult(cb => {
    patched.readFile('secret', err => {
      callbackCount++
      cb(err)
    })
  }), error => error === expected)
  assert.equal(callbackCount, 1)
})

test('unknown queue records cannot execute attacker-controlled non-functions', async () => {
  const queue = global[Symbol.for('graceful-fs.queue')]
  queue.push({ operation: '__proto__', args: [] })

  let attempts = 0
  const fake = cloneFs({
    open: function (_path, _flags, _mode, callback) {
      attempts++
      callback(attempts === 1 ? errorWithCode('EMFILE') : null, 80)
    }
  })
  const patched = graceful.gracefulify(fake)
  patched.open('x', 'r', () => {})
  await new Promise(resolve => setTimeout(resolve, 20))
  assert.equal(queue.length, 0)
  assert.equal(Object.prototype.polluted, undefined)
})
