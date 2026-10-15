import { ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { AssistantReply, AssistantRequest } from '@studely/types'
import { SearchMissesService } from '../search-misses/search-misses.service'
import { AssistantService } from './assistant.service'
import { DegradedModeService } from './degraded-mode.service'
import { FallbackRecommendationService } from './fallback/fallback-recommendation.service'
import { ASSISTANT_NOTICE, SOURCE_MENTION } from './guardrails/wording.guardrails'

const REQUEST: AssistantRequest = {
  message: 'formation SST pour 8 salariés',
  context: { source: 'centre', location: 'Créteil' }
}

const AI_REPLY: AssistantReply = {
  kind: 'recommend',
  text: 'Nous vous recommandons',
  recommendations: [
    {
      slug: 'sst-sauveteur-secouriste-du-travail',
      familySlug: 'secours',
      title: 'SST — Sauveteur Secouriste du Travail',
      description: null,
      durationDays: 2,
      durationHours: null,
      modalities: ['presentiel'],
      certification: 'SST',
      rank: 'primary',
      justification: 'Cette formation est parfaitement adaptée et vous garantit la certification.',
      availability: null,
      url: '/formations/secours/sst-sauveteur-secouriste-du-travail'
    }
  ],
  contextChips: ['SST', '8 salariés', 'Créteil']
}

const FALLBACK_REPLY: AssistantReply = { kind: 'out_of_catalog', text: 'Hors catalogue.' }

function makeService(env: Record<string, string> = {}) {
  const assistant = { reply: vi.fn().mockResolvedValue(AI_REPLY) }
  const fallback = { recommend: vi.fn().mockResolvedValue(FALLBACK_REPLY) }
  const searchMisses = { record: vi.fn().mockResolvedValue(true) }
  const config = { get: (key: string) => env[key] } as unknown as ConfigService
  const service = new DegradedModeService(
    config,
    assistant as unknown as AssistantService,
    fallback as unknown as FallbackRecommendationService,
    searchMisses as unknown as SearchMissesService
  )
  return { service, assistant, fallback, searchMisses }
}

describe('DegradedModeService', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the model reply through the wording guardrails', async () => {
    const { service, fallback, searchMisses } = makeService()

    const reply = await service.answer(REQUEST)

    expect(reply).toMatchObject({
      kind: 'recommend',
      mode: 'ai',
      source: SOURCE_MENTION,
      notice: ASSISTANT_NOTICE,
      contextChips: ['SST', '8 salariés', 'Créteil']
    })
    expect(reply.recommendations?.[0].justification).toBe(
      'Cette formation semble adaptée et vise à vous apporter la certification.'
    )
    expect(fallback.recommend).not.toHaveBeenCalled()
    expect(searchMisses.record).not.toHaveBeenCalled()
  })

  it('falls back when the AI provider is unavailable (simulated outage)', async () => {
    const { service, assistant, fallback } = makeService()
    assistant.reply.mockRejectedValue(new ServiceUnavailableException('assistant unavailable'))

    const reply = await service.answer(REQUEST)

    expect(reply).toEqual({ ...FALLBACK_REPLY, notice: ASSISTANT_NOTICE, mode: 'fallback' })
    expect(fallback.recommend).toHaveBeenCalledWith(REQUEST)
  })

  it('falls back when the AI attempt exceeds the configured time budget', async () => {
    vi.useFakeTimers()
    const { service, assistant, fallback } = makeService({ ASSISTANT_AI_TIMEOUT_MS: '1000' })
    assistant.reply.mockReturnValue(new Promise(() => undefined))

    const pending = service.answer(REQUEST)
    await vi.advanceTimersByTimeAsync(1001)

    await expect(pending).resolves.toMatchObject({ mode: 'fallback' })
    expect(fallback.recommend).toHaveBeenCalledOnce()
  })

  it('waits 30 s by default before falling back', async () => {
    vi.useFakeTimers()
    const { service, assistant, fallback } = makeService({ ASSISTANT_AI_TIMEOUT_MS: 'abc' })
    assistant.reply.mockReturnValue(new Promise(() => undefined))

    const pending = service.answer(REQUEST)
    await vi.advanceTimersByTimeAsync(29_999)
    expect(fallback.recommend).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)

    await expect(pending).resolves.toMatchObject({ mode: 'fallback' })
  })

  it('aborts the in-flight model request once the time budget is exceeded', async () => {
    vi.useFakeTimers()
    const { service, assistant, fallback } = makeService({ ASSISTANT_AI_TIMEOUT_MS: '1000' })
    assistant.reply.mockImplementation(
      (_request: unknown, { signal }: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason))
        })
    )

    const pending = service.answer(REQUEST)
    await vi.advanceTimersByTimeAsync(1001)

    await expect(pending).resolves.toMatchObject({ mode: 'fallback' })
    const options = assistant.reply.mock.calls[0]?.[1] as { signal: AbortSignal }
    expect(options.signal.aborted).toBe(true)
    expect(fallback.recommend).toHaveBeenCalledOnce()
  })

  it('wraps non-Error rejections and still falls back', async () => {
    const { service, assistant } = makeService()
    assistant.reply.mockReturnValue(Promise.reject('boom'))

    await expect(service.answer(REQUEST)).resolves.toMatchObject({ mode: 'fallback' })
  })

  it('stays unavailable when the fallback cannot answer either', async () => {
    const { service, assistant, fallback } = makeService()
    assistant.reply.mockRejectedValue(new ServiceUnavailableException('assistant unavailable'))
    fallback.recommend.mockRejectedValue(new ServiceUnavailableException('assistant unavailable'))

    await expect(service.answer(REQUEST)).rejects.toBeInstanceOf(ServiceUnavailableException)
  })

  it('logs the dead ends of the model with the detected intent', async () => {
    const { service, assistant, searchMisses } = makeService()
    assistant.reply.mockResolvedValue({
      kind: 'no_results',
      text: 'Rien de pertinent.',
      contextChips: ['drone', 'Lyon'],
      slots: { location: 'Lyon' }
    })

    await service.answer({
      message: 'à Lyon',
      history: [{ role: 'user', content: 'pilotage de drone' }],
      context: { location: 'Créteil' }
    })

    expect(searchMisses.record).toHaveBeenCalledWith({
      query: 'pilotage de drone à Lyon',
      outcome: 'no_result',
      source: 'assistant',
      intent: 'drone · Lyon',
      context: { mode: 'ai', location: 'Lyon' }
    })
  })

  it('logs the dead ends of the fallback', async () => {
    const { service, assistant, searchMisses } = makeService()
    assistant.reply.mockRejectedValue(new Error('gateway down'))

    await service.answer(REQUEST)
    await service.answer({ message: 'xylophone' })

    expect(searchMisses.record).toHaveBeenNthCalledWith(1, {
      query: 'formation SST pour 8 salariés',
      outcome: 'out_of_catalog',
      source: 'assistant',
      intent: null,
      context: { mode: 'fallback', location: 'Créteil' }
    })
    expect(searchMisses.record).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ context: { mode: 'fallback', location: null } })
    )
  })

  it('does not log a clarification', async () => {
    const { service, assistant, searchMisses } = makeService()
    assistant.reply.mockResolvedValue({ kind: 'clarify', text: 'Précisez.', question: 'Où ?' })

    await expect(service.answer(REQUEST)).resolves.toMatchObject({ kind: 'clarify', mode: 'ai' })
    expect(searchMisses.record).not.toHaveBeenCalled()
  })
})
