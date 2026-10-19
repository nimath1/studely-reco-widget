/**
 * Point d'entrée du mock MSW — chargé uniquement par la page de dev quand
 * `?recoMock=` est présent ou que `localStorage.recoMock` est posé.
 */
import { setupWorker } from 'msw/browser'
import { currentScenario, handlers } from './handlers'

await setupWorker(...handlers).start({ onUnhandledRequest: 'bypass' })

// eslint-disable-next-line no-console -- outil de dev : confirme le scénario actif.
console.info(`[studely-reco] mock MSW actif — scénario « ${currentScenario()} »`)
