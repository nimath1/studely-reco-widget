/**
 * Serveur MSW pour les tests d'intégration Vitest (node) : mêmes handlers
 * et mêmes scénarios que le mock navigateur — `localStorage.recoMock`
 * choisit le scénario actif entre chaque test.
 */
import { setupServer } from 'msw/node'
import { handlers } from './handlers'

export const server = setupServer(...handlers)
