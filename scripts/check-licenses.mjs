import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const license = await readFile(path.join(root, 'LICENSE'), 'utf8')
const notice = await readFile(path.join(root, 'NOTICE'), 'utf8')
const inventory = await readFile(path.join(root, 'THIRD_PARTY_LICENSES.md'), 'utf8')

assert.equal(pkg.license, 'ISC')
assert.equal(Object.keys(pkg.dependencies || {}).length, 0)
assert.equal(Object.keys(pkg.optionalDependencies || {}).length, 0)
assert.equal(Object.keys(pkg.peerDependencies || {}).length, 0)
assert.match(license, /Copyright \(c\) 2011-2022 Isaac Z\. Schlueter, Ben Noordhuis, and Contributors/)
assert.match(license, /Permission to use, copy, modify, and\/or distribute/)
assert.match(notice, /3961374aa161e6fed80d6f4b6aaf2fb7eafd2c9e5be34e865b375f0114dd099c/)
assert.match(notice, /later BlueOak-licensed/)
assert.match(inventory, /graceful-fs 4\.2\.11 baseline/)
assert.match(inventory, /There are no runtime dependencies/)

process.stdout.write('license and zero-runtime-dependency gate passed\n')
