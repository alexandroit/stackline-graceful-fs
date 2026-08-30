import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const temporary = await mkdtemp(path.join(tmpdir(), 'stackline-graceful-fs-closure-'))

function run (args, cwd, allowAuditFailure = false) {
  const result = spawnSync(npm, args, {
    cwd,
    encoding: 'utf8',
    timeout: 180000,
    env: {
      ...process.env,
      CI: 'true',
      NPM_CONFIG_FUND: 'false',
      NPM_CONFIG_PROGRESS: 'false',
      NPM_CONFIG_UPDATE_NOTIFIER: 'false'
    }
  })
  if (!allowAuditFailure)
    assert.equal(result.status, 0, `${npm} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`)
  return result
}

function assertNoWarnings (result) {
  const output = `${result.stdout}\n${result.stderr}`
  assert.doesNotMatch(output, /npm\s+warn|npm\s+WARN|deprecated|ERESOLVE|EBADENGINE|EINTEGRITY/u)
}

async function verifyConsumer (tarball, alias) {
  const directory = path.join(temporary, alias ? 'alias' : 'direct')
  await mkdir(directory)
  const key = alias ? 'graceful-fs' : '@stackline/graceful-fs'
  // A registry-backed npm alias is verified after the Verdaccio publication.
  // Before publication, the historical key points at the exact local tarball.
  const spec = `file:${tarball}`
  await writeFile(path.join(directory, 'package.json'), `${JSON.stringify({
    name: `graceful-fs-${alias ? 'alias' : 'direct'}-consumer`,
    private: true,
    version: '0.0.0',
    dependencies: { [key]: spec }
  }, null, 2)}\n`)

  const install = run(['install', '--no-fund', '--no-progress', '--loglevel=warn'], directory)
  assertNoWarnings(install)
  const tree = run(['ls', '--all', '--omit=dev', '--json'], directory)
  const parsedTree = JSON.parse(tree.stdout)
  assert.deepEqual(parsedTree.problems || [], [])
  const audit = run(['audit', '--omit=dev', '--audit-level=low', '--json'], directory, true)
  const parsedAudit = JSON.parse(audit.stdout || audit.stderr)
  assert.equal(parsedAudit.metadata.vulnerabilities.total, 0)
  assert.equal(audit.status, 0)

  const smoke = spawnSync(process.execPath, ['-e', `
    const fs = require(${JSON.stringify(key)})
    if (!fs || typeof fs.readFile !== 'function' || typeof fs.gracefulify !== 'function')
      throw new Error('invalid public surface')
  `], { cwd: directory, encoding: 'utf8' })
  assert.equal(smoke.status, 0, smoke.stderr || smoke.stdout)

  const lock = JSON.parse(await readFile(path.join(directory, 'package-lock.json'), 'utf8'))
  const production = Object.entries(lock.packages)
    .filter(([location, node]) => location && node.dev !== true)
  assert.equal(production.length, 1)
  if (production[0][1].name !== undefined)
    assert.equal(production[0][1].name, '@stackline/graceful-fs')
  assert.equal(production[0][1].version, '1.0.0')
}

try {
  const pack = run(['pack', '--silent', '--json', '--ignore-scripts', '--pack-destination', temporary], root)
  const details = JSON.parse(pack.stdout.trim())[0]
  assert.equal(details.name, '@stackline/graceful-fs')
  assert.equal(details.version, '1.0.0')
  const tarball = path.join(temporary, details.filename)

  await verifyConsumer(tarball, false)
  await verifyConsumer(tarball, true)
  process.stdout.write('direct and historical-key production closures are clean\n')
} finally {
  await rm(temporary, { recursive: true, force: true })
}
