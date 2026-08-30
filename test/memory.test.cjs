'use strict'

const assert = require('node:assert/strict')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { test } = require('node:test')

const probe = path.join(__dirname, 'fixtures', 'stream-resource-probe.cjs')

function runProbe (provider) {
  const child = spawnSync(process.execPath, ['--expose-gc', probe, provider], {
    encoding: 'utf8',
    timeout: 120000
  })
  assert.equal(child.status, 0, child.stderr || child.stdout)
  return JSON.parse(child.stdout.trim())
}

test('#248: completed WriteStreams do not accumulate live objects, fds, resources or queue entries', () => {
  const native = runProbe('native')
  const actual = runProbe(path.resolve(__dirname, '..'))

  assert.ok(actual.liveWriteStreams <= native.liveWriteStreams + 4, JSON.stringify({ native, actual }))
  if (actual.fdDelta !== null)
    assert.ok(actual.fdDelta <= 1, JSON.stringify(actual))
  if (actual.fsResourceDelta !== null)
    assert.ok(actual.fsResourceDelta <= 1, JSON.stringify(actual))
  assert.equal(actual.queueLength, 0)
  assert.ok(actual.heapDelta < 16 * 1024 * 1024, JSON.stringify(actual))

  const tailGrowth = actual.heapSamples.at(-1) - actual.heapSamples.at(-2)
  assert.ok(tailGrowth < 4 * 1024 * 1024, JSON.stringify(actual.heapSamples))
})
