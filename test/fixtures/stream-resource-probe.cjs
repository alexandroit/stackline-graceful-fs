'use strict'

const fs = require('node:fs')
const inspector = require('node:inspector')
const os = require('node:os')
const path = require('node:path')

if (typeof global.gc !== 'function')
  throw new Error('stream resource probe requires --expose-gc')

const provider = process.argv[2] === 'native' ? fs : require(path.resolve(process.argv[2]))
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'stackline-gfs-streams-'))
const target = path.join(directory, 'stream.bin')

function post (session, method, params) {
  return new Promise((resolve, reject) => {
    session.post(method, params || {}, (error, value) => error ? reject(error) : resolve(value))
  })
}

function fdCount () {
  if (process.platform !== 'linux')
    return null
  return fs.readdirSync('/proc/self/fd').length
}

function activeFsResources () {
  if (typeof process.getActiveResourcesInfo !== 'function')
    return null
  return process.getActiveResourcesInfo().filter(name => /FS|File|Stream/i.test(name)).length
}

function writeOnce () {
  return new Promise((resolve, reject) => {
    let stream = provider.createWriteStream(target)
    let closes = 0
    stream.once('error', reject)
    stream.once('close', () => {
      closes++
      if (closes !== 1)
        return reject(new Error(`close count ${closes}`))
      stream = null
      resolve()
    })
    stream.end(Buffer.alloc(64))
  })
}

async function livePrototypeObjects () {
  const session = new inspector.Session()
  session.connect()
  global.__stacklineProbePrototype = provider.WriteStream.prototype
  try {
    await post(session, 'Runtime.enable')
    await post(session, 'HeapProfiler.enable')
    await post(session, 'HeapProfiler.collectGarbage')
    const evaluated = await post(session, 'Runtime.evaluate', {
      expression: 'global.__stacklineProbePrototype'
    })
    const queried = await post(session, 'Runtime.queryObjects', {
      prototypeObjectId: evaluated.result.objectId,
      objectGroup: 'stackline-stream-probe'
    })
    const length = await post(session, 'Runtime.callFunctionOn', {
      objectId: queried.objects.objectId,
      functionDeclaration: 'function () { return this.length }',
      returnByValue: true
    })
    await post(session, 'Runtime.releaseObjectGroup', { objectGroup: 'stackline-stream-probe' })
    return length.result.value
  } finally {
    delete global.__stacklineProbePrototype
    session.disconnect()
  }
}

async function collect () {
  for (let index = 0; index < 4; index++) {
    global.gc()
    await new Promise(resolve => setImmediate(resolve))
  }
}

async function main () {
  await collect()
  const before = {
    fd: fdCount(),
    fsResources: activeFsResources(),
    heap: process.memoryUsage().heapUsed
  }
  const heapSamples = []

  for (let batch = 0; batch < 5; batch++) {
    for (let index = 0; index < 500; index++)
      await writeOnce()
    await collect()
    heapSamples.push(process.memoryUsage().heapUsed)
  }

  const after = {
    fd: fdCount(),
    fsResources: activeFsResources(),
    heap: process.memoryUsage().heapUsed
  }

  const result = {
    provider: process.argv[2],
    node: process.version,
    platform: process.platform,
    before,
    after,
    fdDelta: before.fd === null ? null : after.fd - before.fd,
    fsResourceDelta: before.fsResources === null ? null : after.fsResources - before.fsResources,
    heapDelta: after.heap - before.heap,
    heapSamples,
    liveWriteStreams: await livePrototypeObjects(),
    queueLength: provider[Symbol.for('graceful-fs.queue')]
      ? provider[Symbol.for('graceful-fs.queue')].length
      : 0
  }

  process.stdout.write(`${JSON.stringify(result)}\n`)
}

main().finally(() => {
  fs.rmSync(directory, { recursive: true, force: true })
}).catch(error => {
  console.error(error)
  process.exitCode = 1
})
