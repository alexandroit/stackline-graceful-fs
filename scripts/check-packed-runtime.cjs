'use strict'

const assert = require('assert')
const childProcess = require('child_process')
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')

const root = path.resolve(__dirname, '..')
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const npmNode = process.env.STACKLINE_NPM_NODE
const npmCli = process.env.STACKLINE_NPM_CLI
const inheritedNpmCli = process.env.npm_execpath
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'stackline-gfs-packed-'))

function run (command, args, options) {
  const result = childProcess.spawnSync(command, args, Object.assign({
    cwd: temporary,
    encoding: 'utf8',
    stdio: 'pipe'
  }, options || {}))
  if (result.status !== 0) {
    const executionError = result.error ? `${result.error.stack || result.error}\n` : ''
    throw new Error(`${command} ${args.join(' ')} failed (status=${result.status}, signal=${result.signal || 'none'})\n${executionError}${result.stdout || ''}\n${result.stderr || ''}`)
  }
  return result
}

function runNpm (args, options) {
  if (npmNode && npmCli)
    return run(npmNode, [npmCli].concat(args), options)
  if (inheritedNpmCli && /npm-cli\.js$/i.test(inheritedNpmCli))
    return run(process.execPath, [inheritedNpmCli].concat(args), options)
  return run(npmCommand, args, options)
}

function installAndProbe (tarball, dependencyName) {
  const consumer = path.join(temporary, dependencyName === 'graceful-fs' ? 'historical-key-consumer' : 'scoped-consumer')
  fs.mkdirSync(consumer)
  fs.writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({
    name: `stackline-packed-${dependencyName === 'graceful-fs' ? 'historical-key' : 'scoped'}`,
    private: true,
    version: '1.0.0',
    dependencies: {
      [dependencyName]: `file:${tarball}`
    }
  }, null, 2))
  runNpm(['install', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: consumer })

  const probe = [
    "const assert=require('assert')",
    `const provider=require(${JSON.stringify(dependencyName)})`,
    `const clone=require(${JSON.stringify(`${dependencyName}/clone.js`)})`,
    `const polyfills=require(${JSON.stringify(`${dependencyName}/polyfills.js`)})`,
    `const legacy=require(${JSON.stringify(`${dependencyName}/legacy-streams.js`)})`,
    "const fs=require('fs')",
    "const os=require('os')",
    "const path=require('path')",
    "assert.strictEqual(typeof provider.readFile,'function')",
    "assert.strictEqual(typeof provider.gracefulify,'function')",
    "assert.strictEqual(clone.length,1)",
    "assert.strictEqual(clone(function named(){}).name,'named')",
    "assert.strictEqual(typeof polyfills,'function')",
    "assert.strictEqual(typeof legacy,'function')",
    "assert.strictEqual(provider[Symbol.for('graceful-fs.queue')],undefined)",
    "assert.strictEqual(fs[Symbol.for('graceful-fs.queue')],global[Symbol.for('graceful-fs.queue')])",
    "const directory=fs.mkdtempSync(path.join(os.tmpdir(),'stackline-gfs-consumer-'))",
    "const file=path.join(directory,'smoke.txt')",
    "provider.writeFileSync(file,'packed')",
    "assert.strictEqual(provider.readFileSync(file,'utf8'),'packed')",
    "const namespace=Object.preventExtensions(Object.assign({},fs))",
    "const patched=provider.gracefulify(namespace)",
    "assert.notStrictEqual(patched,namespace)",
    "fs.rmSync(directory,{recursive:true,force:true})"
  ].join(';')
  run(process.execPath, ['-e', probe], { cwd: consumer })

  const globalProbe = [
    `const provider=require(${JSON.stringify(dependencyName)})`,
    "const fs=require('fs')",
    "if(provider!==fs)throw new Error('global patch export is not native fs')",
    "if(!fs.__patched)throw new Error('global patch marker missing')",
    "if(typeof fs.close[Symbol.for('graceful-fs.previous')]!=='function')throw new Error('close hook missing')"
  ].join(';')
  run(process.execPath, ['-e', globalProbe], {
    cwd: consumer,
    env: Object.assign({}, process.env, { TEST_GRACEFUL_FS_GLOBAL_PATCH: '1' })
  })

  const esmProbePath = path.join(consumer, 'packed-esm-probe.mjs')
  fs.writeFileSync(esmProbePath, [
    "import assert from 'assert'",
    "import nativeFs from 'fs'",
    "import os from 'os'",
    "import path from 'path'",
    `import provider from ${JSON.stringify(dependencyName)}`,
    `const namespace=await import(${JSON.stringify(dependencyName)})`,
    `const cloneNamespace=await import(${JSON.stringify(`${dependencyName}/clone.js`)})`,
    "assert.strictEqual(namespace.default,provider)",
    "assert.strictEqual(typeof provider.readFile,'function')",
    "assert.strictEqual(typeof provider.gracefulify,'function')",
    "assert.strictEqual(typeof cloneNamespace.default,'function')",
    "assert.strictEqual(cloneNamespace.default.length,1)",
    "const directory=nativeFs.mkdtempSync(path.join(os.tmpdir(),'stackline-gfs-esm-'))",
    "const file=path.join(directory,'esm.txt')",
    "await new Promise((resolve,reject)=>provider.writeFile(file,'esm-packed',error=>error?reject(error):resolve()))",
    "assert.strictEqual(provider.readFileSync(file,'utf8'),'esm-packed')",
    "nativeFs.rmSync(directory,{recursive:true,force:true})"
  ].join('\n'))
  run(process.execPath, [esmProbePath], { cwd: consumer })

  const installed = JSON.parse(fs.readFileSync(path.join(consumer, 'node_modules', dependencyName, 'package.json'), 'utf8'))
  assert.strictEqual(installed.name, '@stackline/graceful-fs')
  assert.strictEqual(installed.version, '1.0.1')
}

try {
  runNpm(['pack', root, '--ignore-scripts'])
  const tarballs = fs.readdirSync(temporary).filter(name => name.endsWith('.tgz'))
  assert.strictEqual(tarballs.length, 1)
  const tarball = path.join(temporary, tarballs[0])
  const bytes = fs.readFileSync(tarball)

  installAndProbe(tarball, '@stackline/graceful-fs')
  installAndProbe(tarball, 'graceful-fs')

  process.stdout.write(`${JSON.stringify({
    node: process.version,
    platform: process.platform,
    tarball: tarballs[0],
    size: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    consumers: ['scoped-cjs-esm', 'historical-key-file-install-cjs-esm']
  })}\n`)
} finally {
  fs.rmSync(temporary, { recursive: true, force: true })
}
