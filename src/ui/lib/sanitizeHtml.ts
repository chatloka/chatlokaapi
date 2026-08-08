// Client-side HTML sanitizer for the ticket detail view.
//
// Inbound email HTML is stored verbatim by the Resend webhook (including
// legacy rows that predate server-side sanitization), so the admin panel must
// not trust it. This is a deterministic, dependency-free allowlist sanitizer:
// unknown tags are dropped and rendered as escaped text, unknown attributes
// are stripped, and attribute values are scheme-validated before re-emission.
// It intentionally over-strips on malformed input.

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "b",
  "strong",
  "i",
  "em",
  "u",
  "s",
  "a",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "code",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "h1",
  "h2",
  "h3",
  "h4",
  "img",
  "span",
  "div",
  "hr",
])

const MAX_INPUT_LENGTH = 500_000

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function escapeText(token: string): string {
  return token.replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function attrAllowed(tag: string, name: string, rawValue: string): string | null {
  const value = rawValue.trim()
  switch (name) {
    case "href":
      if (tag !== "a") return null
      if (!/^(https?:|mailto:)/i.test(value)) return null
      return `href="${escapeAttr(value)}"`
    case "src":
      if (tag !== "img") return null
      if (!/^https?:/i.test(value)) return null
      return `src="${escapeAttr(value)}"`
    case "alt":
      if (tag !== "img") return null
      if (value.length > 500) return null
      return `alt="${escapeAttr(value)}"`
    case "colspan":
    case "rowspan":
      if (tag !== "td" && tag !== "th") return null
      if (!/^\d{1,3}$/.test(value)) return null
      return `${name}="${value}"`
    case "align":
      if (tag !== "td" && tag !== "th") return null
      if (!/^(left|right|center|justify|char)$/i.test(value)) return null
      return `align="${value}"`
    case "class":
      if (tag !== "pre" && tag !== "code") return null
      if (!/^language-[\w+-]+$/.test(value)) return null
      return `class="${value}"`
    default:
      // Strips on*, style, id, srcdoc, sandbox, formaction and everything else.
      return null
  }
}

function parseAttributes(rest: string): Array<[string, string]> {
  const attrs: Array<[string, string]> = []
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(rest)) !== null) {
    attrs.push([m[1].toLowerCase(), m[2] ?? m[3] ?? m[4] ?? ""])
  }
  return attrs
}

function handleToken(token: string): string | null {
  // Comments, doctypes and processing instructions are dropped entirely.
  if (/^<!|^<\?/.test(token)) return ""

  const closeMatch = /^<\/([a-zA-Z][a-zA-Z0-9]*)\s*>$/.exec(token)
  if (closeMatch) {
    const name = closeMatch[1].toLowerCase()
    return ALLOWED_TAGS.has(name) ? `</${name}>` : null
  }

  const openMatch = /^<([a-zA-Z][a-zA-Z0-9]*)([\s\S]*)$/.exec(token)
  if (!openMatch) return null
  const name = openMatch[1].toLowerCase()
  if (!ALLOWED_TAGS.has(name)) return null

  const rest = openMatch[2].replace(/\s*\/\s*$/, "")
  const attrs = parseAttributes(rest)
  const kept: string[] = []
  for (const [attrName, attrValue] of attrs) {
    const emitted = attrAllowed(name, attrName, attrValue)
    if (emitted !== null) kept.push(emitted)
  }
  const attrStr = kept.length > 0 ? ` ${kept.join(" ")}` : ""
  return `<${name}${attrStr}>`
}

export function sanitizeHtml(html: string): string {
  if (!html) return ""
  const input = html.length > MAX_INPUT_LENGTH ? html.slice(0, MAX_INPUT_LENGTH) : html

  let out = ""
  let i = 0
  const len = input.length
  while (i < len) {
    const lt = input.indexOf("<", i)
    if (lt === -1) {
      out += input.slice(i)
      break
    }
    out += input.slice(i, lt)
    const gt = input.indexOf(">", lt)
    if (gt === -1) {
      // Unclosed "<..." — escape as text so the browser cannot treat it as a tag.
      out += "&lt;" + input.slice(lt + 1)
      break
    }
    const token = input.slice(lt, gt + 1)
    const handled = handleToken(token)
    out += handled !== null ? handled : escapeText(token)
    i = gt + 1
  }
  return out
}
