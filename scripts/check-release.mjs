import assert from 'node:assert/strict'
import { access, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const decision = JSON.parse(await readFile(path.join(root, 'decision.json'), 'utf8'))
const memory = await readFile(path.join(root, 'PROJECT_MEMORY.md'), 'utf8')

assert.equal(pkg.name, '@stackline/graceful-fs')
assert.equal(pkg.version, '1.0.0')
assert.equal(pkg.main, 'graceful-fs.js')
assert.equal(pkg.types, 'index.d.ts')
assert.equal(pkg.engines.node, '>=14.14')
assert.equal(pkg.publishConfig.access, 'public')
assert.equal(decision.decision, 'GO')
assert.equal(decision.transition, 'QUALIFIED -> RESEARCHING -> BUILDING')
assert.equal(decision.userPinResolution, 'NOT_PINNED')
assert.equal(decision.canonicalQueueRank, null)
assert.equal(
  decision.upstreamTarball.integrity,
  'sha512-RbJ5/jmFcNNCcDV5o9eTnBLJ/HszWV0P73bc+Ff4nS/rJj+YaS6IGyiOL0VoBYX+l1Wrl3k63h/KrH+nhJ0XvQ=='
)
assert.match(memory, /1fSkwInY9EyfZYQCURnMdOGiTUS6jAY-v/)

for (const file of pkg.files)
  await access(path.join(root, file))

const rootEntries = await readdir(root)
assert.deepEqual(rootEntries.filter(name => /^ignored(?:-|$)/.test(name)), [])
assert.deepEqual(rootEntries.filter(name => name.endsWith('.tgz')), [])

process.stdout.write('release metadata gate passed\n')
