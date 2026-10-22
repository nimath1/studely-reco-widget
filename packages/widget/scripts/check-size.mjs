// Contrôle de taille du bundle (cahier des charges §7 : 25 ko gzip maximum,
// relevé à 32 ko après ajout du parcours chat — hausse validée).
// Lancé après `vite build` : un dépassement fait échouer le build, donc la CI.
// Usage : node scripts/check-size.mjs [fichier] [limite en octets]
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const DEFAULT_FILE = 'dist/reco.js'
const DEFAULT_LIMIT = 32 * 1024

const [file = DEFAULT_FILE, rawLimit] = process.argv.slice(2)
const limit = rawLimit === undefined ? DEFAULT_LIMIT : Number(rawLimit)

if (!Number.isInteger(limit) || limit <= 0) {
  console.error(`Limite invalide : ${rawLimit}`)
  process.exit(1)
}

const size = gzipSync(readFileSync(file), { level: 9 }).length
const kb = (bytes) => `${(bytes / 1024).toFixed(2)} ko`

if (size > limit) {
  console.error(`✗ ${file} : ${kb(size)} gzip, au-delà de la limite de ${kb(limit)}`)
  process.exit(1)
}

console.log(`✓ ${file} : ${kb(size)} gzip (limite ${kb(limit)})`)
