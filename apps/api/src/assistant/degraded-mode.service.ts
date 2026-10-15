import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { AssistantMode, AssistantReply, AssistantRequest } from '@studely/types'
import { SearchMissesService } from '../search-misses/search-misses.service'
import { AssistantService } from './assistant.service'
import { FallbackRecommendationService, needText } from './fallback/fallback-recommendation.service'
import { guardReply } from './guardrails/wording.guardrails'

const DEFAULT_AI_TIMEOUT_MS = 30_000

export class AiUnavailableError extends Error {
  constructor(message = 'AI provider unavailable') {
    super(message)
    this.name = 'AiUnavailableError'
  }
}

/**
 * Budget de temps : au-delà, la promesse est rejetée **et** la requête modèle
 * en vol est annulée via le signal — sans quoi le SDK poursuivrait l'appel et
 * ses retries pendant que le repli répond, en occupant sockets et quota
 * fournisseur.
 */
function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController()
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new AiUnavailableError(`AI timeout after ${timeoutMs}ms`)
      controller.abort(error)
      reject(error)
    }, timeoutMs)
    run(controller.signal).then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    )
  })
}

interface Attempt {
  reply: AssistantReply
  mode: AssistantMode
}

/**
 * Tour de conversation avec mode dégradé : la décision du modèle
 * (`AssistantService`) dispose de `ASSISTANT_AI_TIMEOUT_MS` ; en cas
 * d'erreur, de délai dépassé ou de clé absente, la recherche déterministe
 * répond à sa place — le visiteur obtient toujours des formations du
 * catalogue. Toute réponse passe ensuite par les garde-fous wording, et les
 * impasses (« aucun résultat », « hors catalogue ») sont journalisées pour
 * la revue produit.
 */
@Injectable()
export class DegradedModeService {
  private readonly logger = new Logger(DegradedModeService.name)
  private readonly aiTimeoutMs: number

  constructor(
    config: ConfigService,
    private readonly assistant: AssistantService,
    private readonly fallback: FallbackRecommendationService,
    private readonly searchMisses: SearchMissesService
  ) {
    const raw = Number.parseInt(config.get<string>('ASSISTANT_AI_TIMEOUT_MS') ?? '', 10)
    this.aiTimeoutMs = Number.isNaN(raw) || raw <= 0 ? DEFAULT_AI_TIMEOUT_MS : raw
  }

  async answer(request: AssistantRequest): Promise<AssistantReply> {
    const { reply, mode } = await this.attempt(request)

    const { reply: guarded, issues } = guardReply(reply)
    if (issues.length) {
      this.logger.warn(`Assistant wording adjusted (${mode}): ${issues.join(', ')}`)
    }
    this.recordMiss(request, guarded, mode)

    return { ...guarded, mode }
  }

  private async attempt(request: AssistantRequest): Promise<Attempt> {
    try {
      return {
        reply: await withTimeout(
          (signal) => this.assistant.reply(request, { signal }),
          this.aiTimeoutMs
        ),
        mode: 'ai'
      }
    } catch (error) {
      this.logger.warn(
        { error },
        'AI orchestration unavailable — answering with the deterministic fallback'
      )
      return { reply: await this.fallback.recommend(request), mode: 'fallback' }
    }
  }

  private recordMiss(request: AssistantRequest, reply: AssistantReply, mode: AssistantMode): void {
    if (reply.kind !== 'no_results' && reply.kind !== 'out_of_catalog') return

    // Fire-and-forget : la journalisation n'échoue jamais et ne retarde pas la réponse.
    void this.searchMisses.record({
      query: needText(request),
      outcome: reply.kind === 'no_results' ? 'no_result' : 'out_of_catalog',
      source: 'assistant',
      intent: reply.contextChips?.join(' · ') || null,
      context: { mode, location: reply.slots?.location ?? request.context?.location ?? null }
    })
  }
}
