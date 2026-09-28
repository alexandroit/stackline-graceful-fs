import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSbom } from './sbom-model.mjs'

const root = new URL('../', import.meta.url)
const rootPath = fileURLToPath(root)
const output = path.join(rootPath, 'release-candidate')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function run (command, arguments_) {
  return execFileSync(command, arguments_, {
    cwd: rootPath,
    encoding: 'utf8',
    env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim()
}

function git (arguments_) {
  return run('git', arguments_)
}

function parsePackOutput (output) {
  const jsonStart = output.lastIndexOf('\n[')
  const records = JSON.parse(jsonStart === -1 ? output : output.slice(jsonStart + 1))
  assert.equal(records.length, 1)
  return records[0]
}

function digest (algorithm, bytes, encoding = 'hex') {
  return createHash(algorithm).update(bytes).digest(encoding)
}

const npmVersion = run(npm, ['--version'])
assert.equal(npmVersion, '10.8.2', 'artifact preparation requires the exact npm version used by CI')

const sourceCommit = git(['rev-parse', '--verify', 'HEAD'])
assert.match(sourceCommit, /^[0-9a-f]{40}$/, 'artifact preparation requires a full Git HEAD')
assert.match(
  process.env.STACKLINE_GREEN_COMMIT || '',
  /^[0-9a-f]{40}$/,
  'set STACKLINE_GREEN_COMMIT to the exact CI-green commit'
)
assert.equal(process.env.STACKLINE_GREEN_COMMIT, sourceCommit, 'STACKLINE_GREEN_COMMIT does not match HEAD')
assert.equal(
  git(['status', '--porcelain=v1', '--untracked-files=all']),
  '',
  'artifact preparation requires a completely clean worktree'
)

try {
  await lstat(output)
  assert.fail(`release candidate already exists: ${output}`)
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}

const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'))
assert.equal(manifest.name, '@stackline/graceful-fs')
assert.equal(manifest.version, '1.0.1')
assert.equal(manifest.license, 'ISC')
assert.deepEqual(manifest.dependencies || {}, {}, 'release package must have zero runtime dependencies')
assert.deepEqual(manifest.optionalDependencies || {}, {}, 'release package must have zero optional dependencies')

const commitTimestamp = new Date(git(['show', '-s', '--format=%cI', sourceCommit])).toISOString()
let staging = await mkdtemp(path.join(rootPath, '.release-candidate-staging-'))

try {
  const pack = parsePackOutput(run(npm, [
    'pack',
    '--silent',
    '--json',
    '--ignore-scripts',
    '--pack-destination',
    staging
  ]))
  assert.equal(pack.name, '@stackline/graceful-fs')
  assert.equal(pack.version, '1.0.1')
  assert.equal(pack.entryCount, pack.files.length)

  const tarball = path.join(staging, pack.filename)
  const bytes = await readFile(tarball)
  const hashes = Object.fromEntries(['sha1', 'sha256', 'sha512'].map((algorithm) => [
    algorithm,
    digest(algorithm, bytes)
  ]))
  assert.equal(pack.shasum, hashes.sha1, 'npm shasum does not match the packed bytes')
  assert.equal(
    pack.integrity,
    `sha512-${digest('sha512', bytes, 'base64')}`,
    'npm integrity does not match the packed bytes'
  )

  for (const algorithm of ['sha1', 'sha256', 'sha512']) {
    await writeFile(
      path.join(staging, `${algorithm.toUpperCase()}SUMS`),
      `${hashes[algorithm]}  ${pack.filename}\n`
    )
  }

  const sbom = createSbom({ manifest, sourceCommit, timestamp: commitTimestamp })
  await writeFile(path.join(staging, 'sbom.cdx.json'), `${JSON.stringify(sbom, null, 2)}\n`)
  await writeFile(path.join(staging, 'inventory.json'), `${JSON.stringify(pack.files, null, 2)}\n`)
  await writeFile(path.join(staging, 'release-manifest.json'), `${JSON.stringify({
    commitTimestamp,
    fileCount: pack.entryCount,
    filename: pack.filename,
    hashes,
    integrity: pack.integrity,
    name: pack.name,
    npmVersion,
    packedSize: pack.size,
    sourceCommit,
    unpackedSize: pack.unpackedSize,
    version: pack.version
  }, null, 2)}\n`)
  await writeFile(path.join(staging, 'RELEASE_NOTES.md'), [
    '# @stackline/graceful-fs 1.0.1 release candidate',
    '',
    'Compatibility-first maintained continuation of graceful-fs 4.2.11 with',
    'bounded filesystem retries, first-party types, and preserved ISC licensing.',
    '',
    `Source commit: ${sourceCommit}`,
    '',
    'This artifact is untagged and unpublished. See release-manifest.json for',
    'immutable local hashes and inventory.json for the exact packed files.',
    ''
  ].join('\n'))

  await rename(staging, output)
  staging = null
  console.log(JSON.stringify({
    tarball: path.join(output, pack.filename),
    hashes,
    integrity: pack.integrity,
    sourceCommit
  }, null, 2))
} finally {
  if (staging) await rm(staging, { force: true, recursive: true })
}
