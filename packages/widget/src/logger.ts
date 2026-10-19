/**
 * Seul point de sortie console du widget (exempté de `no-console`) : les
 * messages sont vérifiés en recette (zéro avertissement attendu, §8.1).
 */
const PREFIX = '[studely-reco]'

export const logger = {
  error(...args: unknown[]): void {
    console.error(PREFIX, ...args)
  },
  warn(...args: unknown[]): void {
    console.warn(PREFIX, ...args)
  }
}
