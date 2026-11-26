/**
 * Clonage et remplissage des templates `[data-reco-template]` (§10.2).
 * Data is injected via textContent or as createElement-built DOM nodes
 * only — API text is never reparsed as HTML (§7.4).
 */
import type { ChatCitation } from '../api/types'
import { renderMarkdown } from './markdown'

/** Clone d'un template, sans l'attribut qui le ferait masquer par le CSS. */
export function cloneTemplate(el: HTMLElement, name: string): HTMLElement | null {
  const clone = el.querySelector(`[data-reco-template="${name}"]`)?.cloneNode(true)
  if (!(clone instanceof HTMLElement)) return null
  delete clone.dataset.recoTemplate
  return clone
}

/**
 * Remplit un `data-reco-field` : texte via textContent (jamais interprété),
 * `href` pour un champ posé sur un lien.
 */
export function fillField(root: HTMLElement, name: string, value: string): void {
  const node = root.querySelector(`[data-reco-field="${name}"]`)
  if (node instanceof HTMLAnchorElement) node.href = value
  else if (node) node.textContent = value
}

/**
 * Une citation ne mène que vers une page du site : https sur studely.com
 * ou l'un de ses sous-domaines — ex. support.studely.com (R10). Le bot
 * renvoie aussi ses formulaires HubSpot (share-eu1.hsforms.com) : ce
 * domaine est admis, le reste reste écarté.
 * `endsWith('.…')` rejects look-alikes such as `evil-studely.com`.
 */
const ALLOWED_HOSTS = ['studely.com', 'hsforms.com'] as const

export function isAllowedUrl(url: string | undefined): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return false
    return ALLOWED_HOSTS.some(
      (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)
    )
  } catch {
    return false
  }
}

/**
 * Citations kept for display: real payloads expose `source_url`, `url`
 * stays as the legacy field. Deduped on the resolved URL (sources ∪
 * citations can repeat) before the 5-link display cap.
 */
function allowedCitations(
  citations: ChatCitation[] | undefined
): { citation: ChatCitation; href: string }[] {
  const links: { citation: ChatCitation; href: string }[] = []
  const seen = new Set<string>()
  for (const citation of citations ?? []) {
    const href = citation.url ?? citation.source_url
    if (!isAllowedUrl(href) || seen.has(href!)) continue
    seen.add(href!)
    links.push({ citation, href: href! })
    if (links.length === 5) break
  }
  return links
}

/**
 * Legacy embeds: a <p> cannot hold block nodes — swap it for a <div>
 * while keeping its attributes (§10.2).
 */
function swapParagraphForDiv(body: Element): HTMLElement {
  const div = document.createElement('div')
  for (const attr of Array.from(body.attributes)) div.setAttribute(attr.name, attr.value)
  body.replaceWith(div)
  return div
}

/** Marqueurs littéraux `[S1]`… corrélés aux citations par leur `label`
    — jamais affichés : la liste de liens sous la bulle porte l'accès.
    ` [Sn]` (espace + marqueur) d'abord : « phrase [S1]. » → « phrase. »
    sans toucher à l'espace française avant `:`/`!`/`?`. */
function stripCitationMarkers(text: string): string {
  let out = text
  for (let n = 0; n <= 99; n += 1) {
    out = out.replaceAll(` [S${n}]`, '').replaceAll(`[S${n}]`, '')
  }
  return out
}

/** `updated_at` (ISO) → date courte de la locale (« 15/04/2026 » en fr) ; invalide → absente. */
function citationDate(value: string | undefined, locale: string): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'short' }).format(date)
  } catch {
    return new Intl.DateTimeFormat('fr', { dateStyle: 'short' }).format(date)
  }
}

/**
 * Builds one citation entry: a link pill « Titre · date » that opens the
 * source page in a new tab (the URL already passed the R10 filter). No
 * title → the URL itself is the label.
 */
function citationEntry(
  c: { citation: ChatCitation; href: string },
  locale: string
): HTMLAnchorElement {
  const link = document.createElement('a')
  link.href = c.href
  link.target = '_blank'
  link.rel = 'noopener'
  const title = document.createElement('span')
  title.dataset.recoCitationTitle = ''
  title.textContent = c.citation.title?.trim() || c.href
  link.append(title)
  const date = citationDate(c.citation.updated_at, locale)
  if (date) {
    const stamp = document.createElement('span')
    stamp.dataset.recoCitationDate = ''
    stamp.textContent = ` · ${date}`
    link.append(stamp)
  }
  return link
}

/**
 * Remplit une entrée assistant (`msg-assistant`) : Markdown rendered as
 * createElement-built DOM nodes (never reparsed HTML, §7.4) + citation
 * links — filtered like cards (https studely.com only, R10).
 * `pieces` = texte + liens affichés ; `links` = citations retenues.
 */
export function fillAssistantEntry(
  card: HTMLElement,
  text: string,
  citations: ChatCitation[] | undefined,
  locale = 'fr'
): { pieces: number; links: number } {
  const links = allowedCitations(citations)
  const clean = stripCitationMarkers(text)
  if (!clean.trim() && links.length === 0) return { pieces: 0, links: 0 }
  let body = card.querySelector('[data-reco-field="text"]') ?? card
  const fragment = renderMarkdown(clean.trim(), isAllowedUrl)
  if (body instanceof HTMLParagraphElement && fragment.childElementCount > 0) {
    body = swapParagraphForDiv(body)
  }
  if (body instanceof HTMLElement) body.dataset.recoMarkdown = ''
  body.replaceChildren(fragment)
  const list = card.querySelector('[data-reco-field="links"]')
  if (list) {
    list.replaceChildren()
    for (const link of links) list.append(citationEntry(link, locale))
  }
  return { pieces: links.length + (clean.trim() ? 1 : 0), links: links.length }
}
