import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'check-packed-runtime.cjs')], {
  cwd: root,
  encoding: 'utf8',
  timeout: 180000
})
assert.equal(result.status, 0, result.stderr || result.stdout)
process.stdout.write(result.stdout)
