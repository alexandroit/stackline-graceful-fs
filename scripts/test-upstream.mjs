import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temporary = await mkdtemp(path.join(os.tmpdir(), 'stackline-gfs-upstream-'))
const upstream = path.join(temporary, 'upstream')
const commit = '514861c372899df14beb7aaecca4cdbb498d7d11'
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function run (command, args, cwd, timeout = 180000) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout,
    env: process.env
  })
  assert.equal(result.status, 0, `${command} ${args.join(' ')}\n${result.stdout || ''}\n${result.stderr || ''}`)
  return result
}

try {
  run('git', ['clone', '--filter=blob:none', '--no-checkout', 'https://github.com/isaacs/node-graceful-fs.git', upstream], temporary)
  run('git', ['checkout', '--detach', commit], upstream)
  assert.equal(run('git', ['rev-parse', 'HEAD'], upstream).stdout.trim(), commit)
  run(npmCommand, ['install', '--ignore-scripts', '--no-audit', '--no-fund'], upstream)

  for (const file of ['graceful-fs.js', 'clone.js', 'polyfills.js', 'legacy-streams.js'])
    await copyFile(path.join(root, file), path.join(upstream, file))

  const harnessPath = path.join(upstream, 'test.js')
  const harness = await readFile(harnessPath, 'utf8')
  await writeFile(harnessPath, harness.replace(
    "tap.jobs = require('os').cpus().length",
    "tap.jobs = Math.min(require('os').cpus().length, 4)"
  ))

  const result = run(npmCommand, ['test'], upstream, 600000)
  process.stdout.write(result.stdout)
  process.stdout.write(`${JSON.stringify({
    upstreamCommit: commit,
    normalAndGlobalPatchModes: true,
    status: 'PASS'
  })}\n`)
} finally {
  await rm(temporary, { recursive: true, force: true })
}
