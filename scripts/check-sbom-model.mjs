import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createSbom } from './sbom-model.mjs'

const root = new URL('../', import.meta.url)
const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'))
const sourceCommit = '0000000000000000000000000000000000000000'
const timestamp = '2026-08-29T00:00:00.000Z'
const sbom = createSbom({ manifest, sourceCommit, timestamp })

assert.equal(sbom.bomFormat, 'CycloneDX')
assert.equal(sbom.specVersion, '1.5')
assert.equal(sbom.metadata.timestamp, timestamp)
assert.equal(sbom.metadata.component.name, '@stackline/graceful-fs')
assert.equal(sbom.metadata.component.version, '1.0.1')
assert.deepEqual(sbom.metadata.component.licenses, [{ license: { id: 'ISC' } }])
assert.equal(
  sbom.metadata.component.externalReferences[0].url,
  `https://github.com/alexandroit/stackline-graceful-fs.git#${sourceCommit}`
)
assert.equal(
  sbom.metadata.component.properties.find((property) => property.name === 'stackline:source-commit').value,
  sourceCommit
)
assert.equal(
  sbom.metadata.component.properties.find((property) => property.name === 'stackline:installed-production-component-count').value,
  '0'
)
assert.deepEqual(sbom.components, [])
assert.deepEqual(sbom.dependencies, [{ ref: '@stackline/graceful-fs@1.0.1', dependsOn: [] }])

console.log('CycloneDX dependency-free ISC root and exact VCS commit model passed.')
