/**
 * Optional conversation transcript: if the template provides a
 * `[data-reco-history]` container before the fieldsets, each completed
 * step is rendered there as a question (assistant) / answer (user)
 * bubble pair. Rebuilt on every call: no leftover node from a future
 * step survives navigating back. Text is read from the rendered DOM
 * (legends, option labels) and injected via textContent only — never
 * interpreted HTML (§7.4).
 */
const HISTORY_ATTR = 'data-reco-msg'

function languageAnswers(fieldset: HTMLElement): string[] {
  const answers: string[] = []
  fieldset
    .querySelectorAll<HTMLElement>('[data-reco-options="languages"] [data-reco-value]')
    .forEach((row) => {
      const select = row.querySelector<HTMLSelectElement>('select')
      const language = row.querySelector('[data-reco-field="label"]')?.textContent?.trim()
      const level = select?.selectedOptions[0]?.textContent?.trim()
      // A language without a chosen level (empty option) is not an answer.
      if (select?.value && language && level) answers.push(`${language} : ${level}`)
    })
  return answers
}

function choiceAnswers(fieldset: HTMLElement): string[] {
  const answers: string[] = []
  fieldset
    .querySelectorAll<HTMLInputElement>(
      '[data-reco-options]:not([data-reco-options="languages"]) input:checked'
    )
    .forEach((input) => {
      const label = input
        .closest('label')
        ?.querySelector('[data-reco-field="label"]')
        ?.textContent?.trim()
      answers.push(label ?? input.value)
    })
  return answers
}

function bubble(from: 'assistant' | 'user', text: string): HTMLDivElement {
  const node = document.createElement('div')
  node.setAttribute(HISTORY_ATTR, from)
  node.textContent = text
  return node
}

/**
 * Repaints `[data-reco-history]` for steps `< step`. No container in the
 * template: no-op (the module stays optional and style-free).
 */
export function renderConversation(el: HTMLElement, step: number): void {
  const container = el.querySelector<HTMLElement>('[data-reco-history]')
  if (!container) return
  container.replaceChildren()
  if (step <= 1) return
  el.querySelectorAll<HTMLElement>('[data-reco-step]').forEach((fieldset) => {
    const stepNumber = Number(fieldset.dataset.recoStep)
    if (!Number.isInteger(stepNumber) || stepNumber < 1 || stepNumber >= step) return
    const question = fieldset.querySelector('legend')?.textContent?.trim()
    const answers = [...choiceAnswers(fieldset), ...languageAnswers(fieldset)].filter(
      (answer) => answer.length > 0
    )
    // A step without a complete answer adds no bubble pair.
    if (!question || answers.length === 0) return
    container.append(bubble('assistant', question), bubble('user', answers.join(', ')))
  })
}
