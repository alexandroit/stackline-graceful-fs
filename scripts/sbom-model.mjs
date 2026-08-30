import assert from 'node:assert/strict'

const packageName = '@stackline/graceful-fs'
const packageVersion = '1.0.0'
const packageLicense = 'ISC'

const componentRef = (name, version) => `${name}@${version}`

export function createSbom ({ manifest, sourceCommit, timestamp }) {
  assert.equal(manifest.name, packageName, 'SBOM package name drifted')
  assert.equal(manifest.version, packageVersion, 'SBOM package version drifted')
  assert.equal(manifest.license, packageLicense, 'SBOM package license drifted')
  assert.deepEqual(manifest.dependencies || {}, {}, 'runtime dependencies drifted')
  assert.deepEqual(manifest.optionalDependencies || {}, {}, 'optional runtime dependencies drifted')
  assert.match(sourceCommit, /^[0-9a-f]{40}$/)
  assert.equal(new Date(timestamp).toISOString(), timestamp)

  const repositoryUrl = typeof manifest.repository === 'string'
    ? manifest.repository
    : manifest.repository && manifest.repository.url
  assert.equal(typeof repositoryUrl, 'string', 'package repository URL is required')
  const repository = repositoryUrl.replace(/^git\+/, '')
  const rootRef = componentRef(manifest.name, manifest.version)
  const vcsUrl = `${repository}#${sourceCommit}`

  const sbom = {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    serialNumber: 'urn:uuid:53474653-0000-4000-8000-000000010000',
    version: 1,
    metadata: {
      timestamp,
      component: {
        type: 'library',
        'bom-ref': rootRef,
        name: manifest.name,
        version: manifest.version,
        licenses: [{ license: { id: packageLicense } }],
        purl: 'pkg:npm/%40stackline/graceful-fs@1.0.0',
        externalReferences: [{ type: 'vcs', url: vcsUrl }],
        properties: [
          { name: 'stackline:source-commit', value: sourceCommit },
          { name: 'stackline:installed-production-component-count', value: '0' }
        ]
      }
    },
    components: [],
    dependencies: [{ ref: rootRef, dependsOn: [] }]
  }

  assert.equal(sbom.metadata.component.externalReferences[0].url, vcsUrl)
  assert.deepEqual(sbom.components, [])
  assert.deepEqual(sbom.dependencies, [{ ref: rootRef, dependsOn: [] }])
  return sbom
}
