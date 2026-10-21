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

function appendInline(
  parent: Element | DocumentFragment,
  tokens: Token[] | undefined,
  isAllowed: UrlPredicate
): void {
  for (const token of tokens ?? []) {
    switch (token.type) {
      case 'strong':
      case 'em':
      case 'del': {
        const el = document.createElement(token.type)
        appendInline(el, (token as Tokens.Strong).tokens, isAllowed)
        parent.append(el)
        break
      }
      case 'codespan': {
        const el = document.createElement('code')
        // Inline code is literal: token.text is already raw, entities
        // like `&amp;` must stay exactly as typed.
        el.textContent = (token as Tokens.Codespan).text
        parent.append(el)
        break
      }
      case 'link': {
        const link = token as Tokens.Link
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
        break
      }
      case 'image':
        // Never load remote media: the alt stays plain text.
        parent.append(textNode((token as Tokens.Image).text))
        break
      case 'br':
        parent.append(document.createElement('br'))
        break
      case 'escape':
      case 'text': {
        const text = token as Tokens.Text
        if (text.tokens) appendInline(parent, text.tokens, isAllowed)
        else parent.append(textNode(text.text))
        break
      }
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

function appendBlock(
  parent: Element | DocumentFragment,
  token: Token,
  isAllowed: UrlPredicate
): void {
  switch (token.type) {
    case 'space':
      break
    case 'paragraph': {
      const el = document.createElement('p')
      appendInline(el, (token as Tokens.Paragraph).tokens, isAllowed)
      parent.append(el)
      break
    }
    case 'heading': {
      const heading = token as Tokens.Heading
      const depth = Math.min(6, Math.max(1, heading.depth))
      const el = document.createElement(`h${depth}`)
      appendInline(el, heading.tokens, isAllowed)
      parent.append(el)
      break
    }
    case 'blockquote': {
      const el = document.createElement('blockquote')
      for (const child of (token as Tokens.Blockquote).tokens) appendBlock(el, child, isAllowed)
      parent.append(el)
      break
    }
    case 'list': {
      const list = token as Tokens.List
      const el = document.createElement(list.ordered ? 'ol' : 'ul')
      if (list.ordered && typeof list.start === 'number' && list.start !== 1) {
        el.setAttribute('start', String(list.start))
      }
      for (const item of list.items) {
        const li = document.createElement('li')
        for (const child of item.tokens ?? []) {
          // Tight item: a text token carries the inline content;
          // loose or nested item: real blocks (p, list, …).
          if (child.type === 'text') appendInline(li, (child as Tokens.Text).tokens, isAllowed)
          else if (child.type === 'checkbox')
            li.append(textNode((child as Tokens.Checkbox).checked ? '☑ ' : '☐ '))
          else appendBlock(li, child, isAllowed)
        }
        el.append(li)
      }
      parent.append(el)
      break
    }
    case 'code': {
      const pre = document.createElement('pre')
      const code = document.createElement('code')
      code.textContent = (token as Tokens.Code).text
      pre.append(code)
      parent.append(pre)
      break
    }
    case 'hr':
      parent.append(document.createElement('hr'))
      break
    case 'table': {
      const table = token as Tokens.Table
      const wrap = document.createElement('div')
      wrap.dataset.recoMdTable = ''
      const el = document.createElement('table')
      const head = document.createElement('thead')
      const headRow = document.createElement('tr')
      table.header.forEach((cell, i) => {
        const th = document.createElement('th')
        const align = table.align[i]
        if (align) th.style.textAlign = align
        appendInline(th, cell.tokens, isAllowed)
        headRow.append(th)
      })
      head.append(headRow)
      el.append(head)
      const body = document.createElement('tbody')
      for (const row of table.rows) {
        const tr = document.createElement('tr')
        row.forEach((cell, i) => {
          const td = document.createElement('td')
          const align = table.align[i]
          if (align) td.style.textAlign = align
          appendInline(td, cell.tokens, isAllowed)
          tr.append(td)
        })
        body.append(tr)
      }
      el.append(body)
      wrap.append(el)
      parent.append(wrap)
      break
    }
    case 'html': {
      // Raw HTML block: shown verbatim in its own paragraph.
      const el = document.createElement('p')
      el.append(document.createTextNode((token as Tokens.HTML).raw))
      parent.append(el)
      break
    }
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
