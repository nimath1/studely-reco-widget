// Packages the Vercel site (dist-site) after `vite build` + site build:
// copies dist/reco.js byte-for-byte under the immutable versioned path
// `reco/<version>/` and under the revalidating `reco/v1/` alias, then the
// only public assets of the reference page (Montserrat fonts, logo).
// Previous versions are not regenerated: a Vercel rollback restores an
// earlier deployment instead.
import { copyFileSync, cpSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

// Strict stable semver: a `reco/<version>` path must never derive from a
// pre-release or malformed version, and a published version is never
// reused (the path is immutable, see vercel.json).
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
  console.error(`Non-semver version "${version}" - packaging aborted`)
  process.exit(1)
}

const site = join(root, 'dist-site')
for (const dir of ['v1', version]) {
  const target = join(site, 'reco', dir)
  mkdirSync(target, { recursive: true })
  copyFileSync(join(root, 'dist', 'reco.js'), join(target, 'reco.js'))
}

// Assets referenced by index.html. The MSW worker (mockServiceWorker.js)
// stays a dev tool and is NEVER copied into the production site.
cpSync(join(root, 'public', 'fonts'), join(site, 'fonts'), { recursive: true })
copyFileSync(join(root, 'public', 'studely-brand.jpg'), join(site, 'studely-brand.jpg'))

console.log(`dist-site: reco/v1/reco.js + reco/${version}/reco.js + fonts + logo`)
