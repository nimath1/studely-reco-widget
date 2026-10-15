/**
 * Seul point de sortie console du widget (exempté de `no-console`) : les
 * avertissements sont vérifiés en recette (zéro warning attendu, §8.1).
 */
const PREFIX = '[studely-reco]'

export const logger = {
  warn(...args: unknown[]): void {
    console.warn(PREFIX, ...args)
  }
}
