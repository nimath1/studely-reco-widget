/**
 * Assistant reply Markdown rendering: `marked` tokenization (Lexer only),
 * then DOM construction via createElement/createTextNode — no API data
 * ever reaches an HTML parser and raw HTML stays literal text (§7.4).
 * Links become clickable anchors only when the given predicate accepts
 * the URL (same rule as citations, R10).
 */
import { Lexer } from 'marked'
import type { Token, Tokens } from 'marked'

export type UrlPredicate = (url: string | undefined) => boolean

/**
 * Decodes `&…;` entities one at a time through a reusable DOMParser:
 * only the entity itself is submitted to the parser, never the full
 * text — a decoded `&lt;img&gt;` cannot become a node.
 */
let entityParser: DOMParser | undefined
function decodeEntity(entity: string): string {
  entityParser ??= new DOMParser()
  const decoded = entityParser.parseFromString(`<!doctype html><body>${entity}`, 'text/html')
    .documentElement.textContent
  return decoded || entity
}

const ENTITY = /&(?:#\d+|#x[\da-fA-F]+|[a-zA-Z][\da-zA-Z]+);/g

function textNode(value: string): Text {
  return document.createTextNode(value.includes('&') ? value.replace(ENTITY, decodeEntity) : value)
}

/** Text-level container shared by strong/em/del (`<strong>`, `<em>`, `<del>`). */
function appendFormatted(
  parent: Element | DocumentFragment,
  token: Tokens.Strong | Tokens.Em | Tokens.Del,
  isAllowed: UrlPredicate
): void {
  const el = document.createElement(token.type)
  appendInline(el, token.tokens, isAllowed)
  parent.append(el)
}

function appendCodespan(parent: Element | DocumentFragment, token: Tokens.Codespan): void {
  const el = document.createElement('code')
  // Inline code is literal: token.text is already raw, entities
  // like `&amp;` must stay exactly as typed.
  el.textContent = token.text
  parent.append(el)
}

function appendLink(
  parent: Element | DocumentFragment,
  link: Tokens.Link,
  isAllowed: UrlPredicate
): void {
  if (isAllowed(link.href)) {
    const el = document.createElement('a')
    el.href = link.href
    el.target = '_blank'
    el.rel = 'noopener'
    appendInline(el, link.tokens, isAllowed)
    parent.append(el)
  } else {
    // Rejected URL: keep the label text, drop the link itself.
    appendInline(parent, link.tokens, isAllowed)
  }
}

function appendTextToken(
  parent: Element | DocumentFragment,
  token: Tokens.Text | Tokens.Escape,
  isAllowed: UrlPredicate
): void {
  const text = token as Tokens.Text
  if (text.tokens) appendInline(parent, text.tokens, isAllowed)
  else parent.append(textNode(text.text))
}

function appendInline(
  parent: Element | DocumentFragment,
  tokens: Token[] | undefined,
  isAllowed: UrlPredicate
): void {
  for (const token of tokens ?? []) {
    switch (token.type) {
      case 'strong':
      case 'em':
      case 'del':
        appendFormatted(parent, token as Tokens.Strong, isAllowed)
        break
      case 'codespan':
        appendCodespan(parent, token as Tokens.Codespan)
        break
      case 'link':
        appendLink(parent, token as Tokens.Link, isAllowed)
        break
      case 'image':
        // Never load remote media: the alt stays plain text.
        parent.append(textNode((token as Tokens.Image).text))
        break
      case 'br':
        parent.append(document.createElement('br'))
        break
      case 'escape':
      case 'text':
        appendTextToken(parent, token as Tokens.Text, isAllowed)
        break
      case 'checkbox':
        parent.append(textNode((token as Tokens.Checkbox).checked ? '☑ ' : '☐ '))
        break
      case 'html':
        // Raw inline HTML: literal text, entities left as typed.
        parent.append(document.createTextNode((token as Tokens.HTML).text))
        break
      default:
        parent.append(textNode('raw' in token ? String(token.raw) : ''))
    }
  }
}

function appendParagraph(
  parent: Element | DocumentFragment,
  token: Tokens.Paragraph,
  isAllowed: UrlPredicate
): void {
  const el = document.createElement('p')
  appendInline(el, token.tokens, isAllowed)
  parent.append(el)
}

function renderHeading(
  parent: Element | DocumentFragment,
  heading: Tokens.Heading,
  isAllowed: UrlPredicate
): void {
  const depth = Math.min(6, Math.max(1, heading.depth))
  const el = document.createElement(`h${depth}`)
  appendInline(el, heading.tokens, isAllowed)
  parent.append(el)
}

function renderBlockquote(
  parent: Element | DocumentFragment,
  token: Tokens.Blockquote,
  isAllowed: UrlPredicate
): void {
  const el = document.createElement('blockquote')
  for (const child of token.tokens) appendBlock(el, child, isAllowed)
  parent.append(el)
}

function appendListItem(li: HTMLElement, item: Tokens.ListItem, isAllowed: UrlPredicate): void {
  for (const child of item.tokens ?? []) {
    // Tight item: a text token carries the inline content;
    // loose or nested item: real blocks (p, list, …).
    if (child.type === 'text') appendInline(li, (child as Tokens.Text).tokens, isAllowed)
    else if (child.type === 'checkbox')
      li.append(textNode((child as Tokens.Checkbox).checked ? '☑ ' : '☐ '))
    else appendBlock(li, child, isAllowed)
  }
}

function renderListBlock(
  parent: Element | DocumentFragment,
  list: Tokens.List,
  isAllowed: UrlPredicate
): void {
  const el = document.createElement(list.ordered ? 'ol' : 'ul')
  if (list.ordered && typeof list.start === 'number' && list.start !== 1) {
    el.setAttribute('start', String(list.start))
  }
  for (const item of list.items) {
    const li = document.createElement('li')
    appendListItem(li, item, isAllowed)
    el.append(li)
  }
  parent.append(el)
}

function renderCodeBlock(parent: Element | DocumentFragment, token: Tokens.Code): void {
  const pre = document.createElement('pre')
  const code = document.createElement('code')
  code.textContent = token.text
  pre.append(code)
  parent.append(pre)
}

function appendTableCell(
  tr: HTMLElement,
  cell: Tokens.TableCell,
  align: 'center' | 'left' | 'right' | null,
  tag: 'th' | 'td',
  isAllowed: UrlPredicate
): void {
  const td = document.createElement(tag)
  if (align) td.style.textAlign = align
  appendInline(td, cell.tokens, isAllowed)
  tr.append(td)
}

function renderTableBlock(
  parent: Element | DocumentFragment,
  table: Tokens.Table,
  isAllowed: UrlPredicate
): void {
  const wrap = document.createElement('div')
  wrap.dataset.recoMdTable = ''
  const el = document.createElement('table')
  const head = document.createElement('thead')
  const headRow = document.createElement('tr')
  table.header.forEach((cell, i) => {
    appendTableCell(headRow, cell, table.align[i], 'th', isAllowed)
  })
  head.append(headRow)
  el.append(head)
  const body = document.createElement('tbody')
  for (const row of table.rows) {
    const tr = document.createElement('tr')
    row.forEach((cell, i) => {
      appendTableCell(tr, cell, table.align[i], 'td', isAllowed)
    })
    body.append(tr)
  }
  el.append(body)
  wrap.append(el)
  parent.append(wrap)
}

function renderRawHtmlBlock(parent: Element | DocumentFragment, token: Tokens.HTML): void {
  // Raw HTML block: shown verbatim in its own paragraph.
  const el = document.createElement('p')
  el.append(document.createTextNode(token.raw))
  parent.append(el)
}

function appendBlock(
  parent: Element | DocumentFragment,
  token: Token,
  isAllowed: UrlPredicate
): void {
  switch (token.type) {
    case 'space':
      break
    case 'paragraph':
      appendParagraph(parent, token as Tokens.Paragraph, isAllowed)
      break
    case 'heading':
      renderHeading(parent, token as Tokens.Heading, isAllowed)
      break
    case 'blockquote':
      renderBlockquote(parent, token as Tokens.Blockquote, isAllowed)
      break
    case 'list':
      renderListBlock(parent, token as Tokens.List, isAllowed)
      break
    case 'code':
      renderCodeBlock(parent, token as Tokens.Code)
      break
    case 'hr':
      parent.append(document.createElement('hr'))
      break
    case 'table':
      renderTableBlock(parent, token as Tokens.Table, isAllowed)
      break
    case 'html':
      renderRawHtmlBlock(parent, token as Tokens.HTML)
      break
    default:
      parent.append(textNode('raw' in token ? String(token.raw) : ''))
  }
}

/**
 * Renders `text` into a DocumentFragment of createElement-built nodes —
 * no innerHTML anywhere. `isAllowed` decides which links become anchors.
 */
export function renderMarkdown(text: string, isAllowed: UrlPredicate): DocumentFragment {
  const fragment = document.createDocumentFragment()
  for (const token of Lexer.lex(text)) appendBlock(fragment, token, isAllowed)
  return fragment
}
