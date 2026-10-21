import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useAssistant } from '~/composables/useAssistant'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('$fetch', fetchMock)
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { apiBase: 'http://api.test' } }))
  vi.stubGlobal('logServerError', vi.fn())
  vi.stubGlobal('internalSsrHeaders', () => undefined)
})

describe('useAssistant', () => {
  it('sends a message and appends the assistant reply', async () => {
    fetchMock.mockResolvedValue({ kind: 'clarify', text: 'Précisez.', suggestions: ['SST'] })
    const assistant = useAssistant()

    await assistant.send('je veux former mes équipes')

    expect(assistant.entries.value).toHaveLength(2)
    expect(assistant.entries.value[0]).toMatchObject({
      role: 'user',
      content: 'je veux former mes équipes'
    })
    expect(assistant.entries.value[1]?.reply?.kind).toBe('clarify')
    expect(assistant.started.value).toBe(true)
  })

  it('posts the conversation history and entry-point context', async () => {
    fetchMock.mockResolvedValue({ kind: 'clarify', text: 'ok' })
    const assistant = useAssistant({ source: 'centre', location: 'Créteil' })

    await assistant.send('premier')
    await assistant.send('second')

    const body = fetchMock.mock.calls[1]?.[1]?.body
    expect(body.context).toEqual({ source: 'centre', location: 'Créteil' })
    expect(body.message).toBe('second')
    expect(body.history).toEqual([
      { role: 'user', content: 'premier' },
      { role: 'assistant', content: 'ok' }
    ])
  })

  it('excludes the local greeting from the posted history', async () => {
    fetchMock.mockResolvedValue({ kind: 'clarify', text: 'ok' })
    const assistant = useAssistant()

    // Accueil E1 injecté localement : jamais transmis à l'API.
    assistant.append({ role: 'assistant', content: 'Bonjour, décrivez votre besoin.' })
    await assistant.send('premier')

    const firstBody = fetchMock.mock.calls[0]?.[1]?.body
    expect(firstBody.message).toBe('premier')
    expect(firstBody.history).toEqual([])

    await assistant.send('second')
    const secondBody = fetchMock.mock.calls[1]?.[1]?.body
    // L'accueil local reste exclu ; les tours réels sont conservés.
    expect(secondBody.history).toEqual([
      { role: 'user', content: 'premier' },
      { role: 'assistant', content: 'ok' }
    ])
  })

  it('ignores empty messages', async () => {
    const assistant = useAssistant()
    await assistant.send('   ')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(assistant.entries.value).toHaveLength(0)
  })

  it('edits a user message, truncates later turns and resends', async () => {
    fetchMock.mockResolvedValue({ kind: 'clarify', text: 'ok' })
    const assistant = useAssistant()

    await assistant.send('premier')
    await assistant.send('second')
    expect(assistant.entries.value).toHaveLength(4)

    const messageId = assistant.entries.value[0]?.id
    expect(messageId).toBeDefined()
    await assistant.editAndSend(messageId!, 'premier modifié')

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[2]?.[1]?.body).toMatchObject({
      message: 'premier modifié',
      history: []
    })
    expect(assistant.entries.value).toHaveLength(2)
    expect(assistant.entries.value[0]).toMatchObject({
      id: messageId,
      role: 'user',
      content: 'premier modifié'
    })
  })

  it('stops the active request and drops queued sends without clearing messages', async () => {
    fetchMock.mockImplementation(
      (_url: string, options: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => {
            const error = new Error('aborted')
            error.name = 'AbortError'
            reject(error)
          })
        })
    )
    const assistant = useAssistant()

    const first = assistant.send('un')
    const second = assistant.send('deux')
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    await assistant.stop()
    await Promise.all([first, second])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(assistant.entries.value).toEqual([
      expect.objectContaining({ role: 'user', content: 'un' })
    ])
    expect(assistant.pending.value).toBe(false)
    expect(assistant.started.value).toBe(true)
  })

  it('serializes concurrent sends and replays history in order', async () => {
    let resolveFirst: ((reply: unknown) => void) | undefined
    fetchMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve
          })
      )
      .mockResolvedValue({ kind: 'clarify', text: 'réponse deux' })
    const assistant = useAssistant()

    // Les deux envois sont acceptés : le second attend la fin du premier.
    const first = assistant.send('un')
    const second = assistant.send('deux')

    // Un envoi seulement en file compte déjà comme en cours.
    expect(assistant.pending.value).toBe(true)

    // Tant que la première requête est en vol, aucune seconde ne part.
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(fetchMock).toHaveBeenCalledTimes(1)

    resolveFirst?.({ kind: 'clarify', text: 'réponse un' })
    await Promise.all([first, second])

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const firstBody = fetchMock.mock.calls[0]?.[1]?.body
    expect(firstBody.message).toBe('un')
    expect(firstBody.history).toEqual([])
    const secondBody = fetchMock.mock.calls[1]?.[1]?.body
    expect(secondBody.message).toBe('deux')
    // L'historique contient les tours précédents, pas le message courant.
    expect(secondBody.history).toEqual([
      { role: 'user', content: 'un' },
      { role: 'assistant', content: 'réponse un' }
    ])
    expect(assistant.entries.value).toHaveLength(4)
  })

  it('aborts the active request on reset and skips queued sends', async () => {
    fetchMock.mockImplementation(
      (_url: string, options: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => {
            const error = new Error('aborted')
            error.name = 'AbortError'
            reject(error)
          })
        })
    )
    const assistant = useAssistant()

    const first = assistant.send('un')
    const second = assistant.send('deux')

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    assistant.reset()

    await vi.waitFor(() => expect(assistant.pending.value).toBe(false))
    await Promise.all([first, second])
    expect(assistant.entries.value).toHaveLength(0)
    expect(assistant.started.value).toBe(false)
    // L'envoi encore en file est abandonné : une seule requête a été lancée.
    expect(fetchMock).toHaveBeenCalledTimes(1)

    fetchMock.mockResolvedValue({ kind: 'clarify', text: 'ok' })
    await assistant.send('trois')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(assistant.entries.value).toHaveLength(2)
  })

  it('does not block a new conversation on a request that ignores abort', async () => {
    let resolveFirst: ((reply: unknown) => void) | undefined
    fetchMock
      .mockImplementationOnce(
        (_url: string, options: { signal?: AbortSignal }) =>
          new Promise((resolve) => {
            // Le transport sous-jacent ignore volontairement le signal.
            options.signal?.addEventListener('abort', () => {})
            resolveFirst = resolve
          })
      )
      .mockResolvedValue({ kind: 'clarify', text: 'réponse fraîche' })
    const assistant = useAssistant()

    const stale = assistant.send('ancien')
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    assistant.reset()
    const fresh = assistant.send('nouveau')

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    await fresh
    resolveFirst?.({ kind: 'clarify', text: 'réponse périmée' })
    await stale

    expect(fetchMock.mock.calls[1]?.[1]?.body.message).toBe('nouveau')
    expect(assistant.entries.value).toHaveLength(2)
    expect(assistant.entries.value[0]?.content).toBe('nouveau')
    expect(assistant.entries.value[1]?.content).toBe('réponse fraîche')
    expect(assistant.unavailable.value).toBe(false)
  })

  it('ignores a late transport failure after reset', async () => {
    let rejectFirst: ((error: Error) => void) | undefined
    fetchMock.mockImplementationOnce(
      (_url: string, options: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          rejectFirst = reject
          options.signal?.addEventListener('abort', () => {
            setTimeout(() => reject(new Error('late network error')), 0)
          })
        })
    )
    const assistant = useAssistant()

    const stale = assistant.send('ancien')
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    assistant.reset()

    await stale
    expect(rejectFirst).toBeDefined()
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(assistant.entries.value).toHaveLength(0)
    expect(assistant.pending.value).toBe(false)
    expect(assistant.unavailable.value).toBe(false)
  })

  it('drops a send reset synchronously before it starts', async () => {
    fetchMock.mockResolvedValue({ kind: 'clarify', text: 'x' })
    const assistant = useAssistant()

    // `reset()` dans le même tick que `send` : l'envoi en file est abandonné
    // avant que `sendMessage` ne pousse le message ni ne lance la requête.
    const sent = assistant.send('un')
    assistant.reset()

    await sent
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(assistant.entries.value).toHaveLength(0)
    expect(assistant.started.value).toBe(false)
    expect(assistant.pending.value).toBe(false)
  })

  it('flags the assistant as unavailable on API failure and retries', async () => {
    fetchMock.mockRejectedValueOnce(new Error('503'))
    const assistant = useAssistant()

    await assistant.send('bonjour')
    expect(assistant.unavailable.value).toBe(true)
    expect(assistant.entries.value).toHaveLength(1)

    fetchMock.mockResolvedValue({ kind: 'clarify', text: 'ok' })
    await assistant.retry()
    expect(assistant.unavailable.value).toBe(false)
    expect(assistant.entries.value).toHaveLength(2)
  })

  it('flags a malformed assistant payload as unavailable', async () => {
    fetchMock.mockResolvedValue({ unexpected: true })
    const assistant = useAssistant()

    await assistant.send('bonjour')

    expect(assistant.unavailable.value).toBe(true)
    expect(assistant.entries.value).toHaveLength(1)
    expect(assistant.entries.value[0]?.role).toBe('user')
  })

  it('aggregates contextChips and slots across turns', async () => {
    fetchMock
      .mockResolvedValueOnce({ kind: 'clarify', text: 'x', contextChips: ['SST'] })
      .mockResolvedValueOnce({
        kind: 'recommend',
        text: 'y',
        contextChips: ['SST', '8 salariés'],
        slots: { headcount: 8, location: 'Créteil' }
      })
    const assistant = useAssistant()

    await assistant.send('sst')
    await assistant.send('8 à créteil')

    expect(assistant.contextChips.value).toEqual(['SST', '8 salariés'])
    expect(assistant.slots.value).toEqual({ headcount: 8, location: 'Créteil' })
    expect(assistant.needSummary.value).toBe('sst 8 à créteil')
  })

  it('resets the conversation', async () => {
    fetchMock.mockResolvedValue({ kind: 'clarify', text: 'x' })
    const assistant = useAssistant()
    await assistant.send('bonjour')

    assistant.reset()

    expect(assistant.entries.value).toHaveLength(0)
    expect(assistant.started.value).toBe(false)
    expect(assistant.needSummary.value).toBe('')
  })

  it('reports each API reply with the user turn that produced it', async () => {
    const clarify = { kind: 'clarify', text: 'Pour combien de personnes ?' }
    const recommend = { kind: 'recommend', text: 'Nous vous recommandons', recommendations: [] }
    fetchMock.mockResolvedValueOnce(clarify).mockResolvedValueOnce(recommend)
    const onReply = vi.fn()
    const assistant = useAssistant({}, { onReply })

    // L'accueil local n'est pas une réponse de l'API.
    assistant.append({ role: 'assistant', content: 'Bonjour' })
    await assistant.send('sst')
    await assistant.send('8 salariés')

    expect(onReply).toHaveBeenCalledTimes(2)
    expect(onReply).toHaveBeenNthCalledWith(1, clarify, { turn: 1 })
    expect(onReply).toHaveBeenNthCalledWith(2, recommend, { turn: 2 })
  })

  it('signals when a queued send actually starts, with the thread as it was before that turn', async () => {
    let resolveFirst: ((reply: unknown) => void) | undefined
    fetchMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve
          })
      )
      .mockResolvedValue({ kind: 'clarify', text: 'ok' })
    const assistant = useAssistant()
    const turnsAtStart: number[] = []
    const onStart = () =>
      turnsAtStart.push(assistant.entries.value.filter((e) => e.role === 'user').length)

    const first = assistant.send('un', { onStart })
    const second = assistant.send('deux', { onStart })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    // Le second envoi attend en file : il n'a pas encore démarré.
    expect(turnsAtStart).toEqual([0])

    resolveFirst?.({ kind: 'clarify', text: 'réponse un' })
    await Promise.all([first, second])
    expect(turnsAtStart).toEqual([0, 1])
  })

  it('never signals the start of a send dropped by a reset, nor of an edit that is', async () => {
    fetchMock.mockResolvedValue({ kind: 'clarify', text: 'x' })
    const assistant = useAssistant()
    const onStart = vi.fn()

    const sent = assistant.send('un', { onStart })
    const edited = assistant.editAndSend('unknown', 'deux', { onStart })
    assistant.reset()
    await Promise.all([sent, edited])

    expect(onStart).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('exposes the last API reply and whether a clarification is awaited', async () => {
    const clarify = { kind: 'clarify', text: 'Précisez.', mode: 'ai' }
    fetchMock
      .mockResolvedValueOnce(clarify)
      .mockResolvedValueOnce({ kind: 'recommend', text: 'ok', recommendations: [] })
    const assistant = useAssistant()

    // L'accueil local est une question, pas une réponse de l'API.
    assistant.append({
      role: 'assistant',
      content: 'Bonjour',
      reply: { kind: 'clarify', text: 'Bonjour' }
    })
    expect(assistant.lastReply.value).toBeUndefined()
    expect(assistant.awaitingClarification.value).toBe(false)

    await assistant.send('sst')
    expect(assistant.lastReply.value).toEqual(clarify)
    expect(assistant.awaitingClarification.value).toBe(true)

    await assistant.send('8 salariés')
    expect(assistant.lastReply.value?.kind).toBe('recommend')
    expect(assistant.awaitingClarification.value).toBe(false)

    assistant.reset()
    expect(assistant.lastReply.value).toBeUndefined()
  })
})
