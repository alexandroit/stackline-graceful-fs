import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function runNpm (arguments_) {
  return execFileSync(npm, arguments_, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe']
  })
}

function parsePackOutput (output) {
  const trimmed = output.trim()
  const jsonStart = trimmed.lastIndexOf('\n[')
  const records = JSON.parse(jsonStart === -1 ? trimmed : trimmed.slice(jsonStart + 1))
  assert.equal(records.length, 1)
  return records[0]
}

async function pack (destination) {
  const details = parsePackOutput(runNpm([
    'pack',
    '--silent',
    '--json',
    '--ignore-scripts',
    '--pack-destination',
    destination
  ]))
  const bytes = await readFile(path.join(destination, details.filename))
  return { bytes, details }
}

const temporary = await mkdtemp(path.join(tmpdir(), 'stackline-graceful-fs-pack-'))

try {
  const firstDirectory = path.join(temporary, 'first')
  const secondDirectory = path.join(temporary, 'second')
  await Promise.all([mkdir(firstDirectory), mkdir(secondDirectory)])

  const first = await pack(firstDirectory)
  const second = await pack(secondDirectory)

  assert.equal(first.details.name, '@stackline/graceful-fs')
  assert.equal(first.details.version, '1.0.0')
  assert.equal(first.details.entryCount, first.details.files.length)
  assert.deepEqual(second.details, first.details)
  assert.deepEqual(second.bytes, first.bytes)

  const sha256 = createHash('sha256').update(first.bytes).digest('hex')
  console.log(`Two ephemeral npm packs are byte-identical: ${sha256}`)
} finally {
  await rm(temporary, { force: true, recursive: true })
}
