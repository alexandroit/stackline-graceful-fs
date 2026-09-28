import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temporaryBase = path.join(os.homedir(), '.cache', 'stackline-downstreams')
await mkdir(temporaryBase, { recursive: true })
const temporary = await mkdtemp(path.join(temporaryBase, 'graceful-fs-'))
const hermeticTmp = path.join(temporary, 'hermetic-tmp')
await mkdir(hermeticTmp)
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const requested = process.env.STACKLINE_DOWNSTREAM || 'all'
const results = []
const ansiEscapeSequence = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, 'g')
const bubblewrapAvailable = process.platform === 'linux' && spawnSync('bwrap', [
  '--die-with-parent',
  '--ro-bind', '/', '/',
  '--dev-bind', '/dev', '/dev',
  '--proc', '/proc',
  '/bin/true'
], { encoding: 'utf8' }).status === 0
const emptyUserConfig = path.join(temporary, 'empty-user-npmrc')
await writeFile(emptyUserConfig, '')
const downstreamEnv = {
  ...process.env,
  NPM_CONFIG_USERCONFIG: emptyUserConfig
}

function run (command, args, cwd, timeout = 600000, env = downstreamEnv) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    timeout,
    maxBuffer: 64 * 1024 * 1024
  })
  const combined = `${result.stdout || ''}\n${result.stderr || ''}`
  const diagnostic = combined
    .replace(ansiEscapeSequence, '')
    .split('\n')
    .filter(line => /(?:^|\s)(?:not ok|FAIL|failed|timeout|SIG[A-Z]+|ERR_[A-Z_]+|Error:)/i.test(line))
    .slice(-400)
    .join('\n')
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(' ')} failed in ${cwd}; signal=${result.signal || 'none'}; ` +
      `spawnError=${result.error ? result.error.message : 'none'}\n` +
      `filtered diagnostics:\n${diagnostic || '(none)'}\n` +
      `output tail:\n${combined.slice(-65536)}`
  )
  return result
}

function runWithUmask (command, args, cwd, timeout = 600000, env = downstreamEnv) {
  const previous = process.umask(0o022)
  try {
    return run(command, args, cwd, timeout, env)
  } finally {
    process.umask(previous)
  }
}

function runHermetic (command, args, cwd, timeout, env) {
  if (!bubblewrapAvailable) return run(command, args, cwd, timeout, env)
  return run('bwrap', [
    '--die-with-parent',
    '--new-session',
    '--ro-bind', '/', '/',
    '--dev-bind', '/dev', '/dev',
    '--proc', '/proc',
    '--bind', temporary, temporary,
    '--bind', hermeticTmp, '/tmp',
    '--chdir', cwd,
    command,
    ...args
  ], root, timeout, env)
}

function resolveNode26 (cwd) {
  const candidate = process.env.STACKLINE_NODE26 ||
    (process.versions.node.split('.')[0] === '26' ? process.execPath : '')
  assert.ok(candidate, 'run with Node 26 or set STACKLINE_NODE26 to a Node 26 binary')
  const version = run(candidate, ['-p', 'process.versions.node'], cwd).stdout.trim()
  assert.match(version, /^26\./, `expected Node 26, received ${version}`)
  return candidate
}

async function clonePinned (repository, commit, name) {
  const target = path.join(temporary, name)
  run('git', ['clone', '--filter=blob:none', '--no-checkout', repository, target], temporary)
  run('git', ['checkout', '--detach', commit], target)
  assert.equal(run('git', ['rev-parse', 'HEAD'], target).stdout.trim(), commit)
  return target
}

async function replaceDirectDependency (repository, tarball) {
  const manifestPath = path.join(repository, 'package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  assert.ok(manifest.dependencies && manifest.dependencies['graceful-fs'])
  manifest.dependencies['graceful-fs'] = `file:${tarball}`
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
}

async function verifyInstalled (repository) {
  const installed = JSON.parse(await readFile(
    path.join(repository, 'node_modules', 'graceful-fs', 'package.json'),
    'utf8'
  ))
  assert.equal(installed.name, '@stackline/graceful-fs')
  assert.equal(installed.version, '1.0.1')
  const tree = run(npmCommand, ['ls', 'graceful-fs', '--all', '--json'], repository).stdout
  return JSON.parse(tree)
}

async function testFsExtra (tarball) {
  const commit = '53a8d1a63c8eb30573110ed0f6528975f98801f0'
  const repository = await clonePinned('https://github.com/jprichardson/node-fs-extra.git', commit, 'fs-extra')
  runWithUmask(npmCommand, ['install', '--no-audit', '--no-fund'], repository)
  const baseline = runWithUmask(npmCommand, ['test'], repository)
  await replaceDirectDependency(repository, tarball)
  runWithUmask(npmCommand, ['install', '--no-audit', '--no-fund'], repository)
  const tree = await verifyInstalled(repository)
  const migrated = runWithUmask(npmCommand, ['test'], repository)
  const warning = /fs\.realpath\.native/.test(`${baseline.stdout}${baseline.stderr}`)
  assert.equal(/fs\.realpath\.native/.test(`${migrated.stdout}${migrated.stderr}`), warning)
  results.push({
    name: 'jprichardson/node-fs-extra',
    commit,
    version: '11.4.0',
    status: 'PASS_BASELINE_AND_MIGRATION',
    umask: '0022',
    baselineRealpathWarning: warning,
    migratedRealpathWarning: warning,
    tree
  })
}

async function testNodeGyp (tarball) {
  const commit = '936498fcfa2eeb8e3a6873812f076c5dbb78dadd'
  const repository = await clonePinned('https://github.com/nodejs/node-gyp.git', commit, 'node-gyp')
  await replaceDirectDependency(repository, tarball)
  run(npmCommand, ['install', '--no-audit', '--no-fund'], repository)
  const tree = await verifyInstalled(repository)
  const node26 = resolveNode26(repository)
  const testFiles = (await readdir(path.join(repository, 'test')))
    .filter(name => /^test-.*\.js$/.test(name))
    .map(name => path.join('test', name))
  run(
    node26,
    ['node_modules/mocha/bin/mocha.js', '--timeout', '30000'].concat(testFiles),
    repository,
    600000,
    { ...downstreamEnv, NODE_GYP_NULL_LOGGER: 'true' }
  )
  run(node26, ['-e', "require('./lib/node-gyp.js');require('graceful-fs').statSync('package.json')"], repository)
  results.push({ name: 'nodejs/node-gyp', commit, version: '13.0.2', node: run(node26, ['-v'], repository).stdout.trim(), status: 'PASS', tree })
}

async function testJest (tarball) {
  const consumer = path.join(temporary, 'jest-consumer')
  await mkdir(consumer)
  await writeFile(path.join(consumer, 'package.json'), `${JSON.stringify({
    name: 'stackline-jest-30-compatibility',
    private: true,
    version: '1.0.0',
    scripts: { test: 'jest --runInBand --detectOpenHandles' },
    dependencies: {
      jest: '30.5.0',
      'graceful-fs': `file:${tarball}`
    },
    overrides: {
      'graceful-fs': `file:${tarball}`
    }
  }, null, 2)}\n`)
  await writeFile(path.join(consumer, 'sum.js'), "module.exports=(a,b)=>a+b\n")
  await writeFile(path.join(consumer, 'sum.test.js'), [
    "const fs=require('graceful-fs')",
    "const path=require('node:path')",
    "const sum=require('./sum')",
    "test('filesystem and module transforms remain stable',async()=>{",
    "  expect(sum(2,3)).toBe(5)",
    "  const target=path.join(__dirname,'jest-output.txt')",
    "  await new Promise((resolve,reject)=>fs.writeFile(target,'jest',error=>error?reject(error):resolve()))",
    "  expect(fs.readFileSync(target,'utf8')).toBe('jest')",
    "  fs.unlinkSync(target)",
    "})"
  ].join('\n'))
  run(npmCommand, ['install', '--no-audit', '--no-fund'], consumer)
  const tree = await verifyInstalled(consumer)
  run(npmCommand, ['test'], consumer)
  results.push({
    name: 'jestjs/jest',
    commit: '912baa37afaa979e8179240c238cb493f960527a',
    version: '30.5.0',
    status: 'PASS_CONSUMER_SUITE',
    tree
  })
}

async function replaceVendoredPackage (repository, tarball) {
  const extraction = path.join(temporary, 'candidate-extraction')
  await mkdir(extraction)
  run('tar', ['-xzf', tarball, '-C', extraction], temporary)
  const target = path.join(repository, 'node_modules', 'graceful-fs')
  await rm(target, { recursive: true, force: true })
  await rename(path.join(extraction, 'package'), target)
}

async function testNpmCli (tarball) {
  const commit = '81a901c9a5913f9bd8104e6196af3580eafa13cb'
  const repository = await clonePinned('https://github.com/npm/cli.git', commit, 'npm-cli')
  const node26 = resolveNode26(repository)
  const isolatedHome = path.join(temporary, 'npm-cli-home')
  await mkdir(isolatedHome)
  const isolatedUserConfig = path.join(isolatedHome, '.npmrc')
  await writeFile(isolatedUserConfig, '')
  const node26SetupEnv = {
    ...downstreamEnv,
    PATH: `${path.dirname(node26)}${path.delimiter}${downstreamEnv.PATH}`
  }
  const node26TestBaseEnv = { ...node26SetupEnv }
  delete node26TestBaseEnv.NPM_CONFIG_USERCONFIG
  delete node26TestBaseEnv.npm_config_userconfig
  const npmTestEnv = {
    ...node26TestBaseEnv,
    HOME: isolatedHome,
    USERPROFILE: isolatedHome,
    TMPDIR: hermeticTmp,
    TMP: hermeticTmp,
    TEMP: hermeticTmp
  }
  run(node26, ['scripts/resetdeps.js'], repository, 900000, node26SetupEnv)
  runHermetic(node26, ['node_modules/tap/bin/run.js', '--jobs=1', '--reporter=classic'], repository, 1200000, npmTestEnv)
  runHermetic(node26, ['.', 'run', 'lint'], repository, 1200000, npmTestEnv)
  await replaceVendoredPackage(repository, tarball)
  const installed = JSON.parse(await readFile(path.join(repository, 'node_modules', 'graceful-fs', 'package.json'), 'utf8'))
  assert.equal(installed.name, '@stackline/graceful-fs')
  run(node26, ['-e', "const fs=require('./node_modules/graceful-fs');fs.gracefulify(require('node:fs'));require('./lib/cli/entry.js')"], repository, 600000, npmTestEnv)
  runHermetic(node26, ['node_modules/tap/bin/run.js', '--jobs=1', '--reporter=classic'], repository, 1200000, npmTestEnv)
  runHermetic(node26, ['.', 'run', 'lint'], repository, 1200000, npmTestEnv)
  results.push({
    name: 'npm/cli',
    commit,
    version: '12.0.2',
    node: run(node26, ['-v'], repository).stdout.trim(),
    hermeticFilesystem: bubblewrapAvailable,
    status: 'PASS_BASELINE_AND_MIGRATION'
  })
}

try {
  run(npmCommand, ['pack', root, '--ignore-scripts'], temporary)
  const tarballs = (await readdir(temporary)).filter(name => name.endsWith('.tgz'))
  assert.equal(tarballs.length, 1)
  const tarball = path.join(temporary, tarballs[0])
  const bytes = await readFile(tarball)
  const artifact = {
    filename: tarballs[0],
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    size: bytes.length
  }

  if (requested === 'all' || requested === 'fs-extra') await testFsExtra(tarball)
  if (requested === 'all' || requested === 'node-gyp') await testNodeGyp(tarball)
  if (requested === 'all' || requested === 'jest') await testJest(tarball)
  if (requested === 'all' || requested === 'npm') await testNpmCli(tarball)

  process.stdout.write(`${JSON.stringify({ artifact, requested, results }, null, 2)}\n`)
} finally {
  await rm(temporary, { recursive: true, force: true })
}
